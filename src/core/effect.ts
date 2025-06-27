import { EFFECT_RENDER, EFFECT_USER } from "./constants.js";
import { latest, type SignalOptions } from "./core.js";
import { ERROR_BIT } from "./flags.js";
import type { Owner } from "./owner.js";
import { computed, isEqual, onCleanup, type Computed } from "./r3.js";
import { getClock, globalQueue } from "./scheduler.js";

interface Effect<T> extends Computed<T>, Owner {
  _effect: (err: unknown, val: T, prev: T | undefined) => void | (() => void);
  _cleanup?: () => void;
  _modified: boolean;
  _prevValue: T | undefined;
  _type: typeof EFFECT_RENDER | typeof EFFECT_USER;
}

/**
 * Effects are the leaf nodes of our reactive graph. When their sources change, they are
 * automatically added to the queue of effects to re-execute, which will cause them to fetch their
 * sources and recompute
 */
export function effect<T>(
  compute: (prev: T | undefined) => T,
  effect: (err: unknown, val: T, prev: T | undefined) => void | (() => void),
  initialValue?: T,
  options?: SignalOptions<any> & { render?: boolean; defer?: boolean }
): void {
  let initialized = false;
  const node = computed<T>(compute, initialValue, {
    ...options,
    equals: (prev, val) => {
      const equal = isEqual(prev, val);
      if (initialized) {
        node._modified = !equal;
        if (!equal) {
          node._queue.enqueue(node._type, runEffect.bind(node));
        }
      }
      return equal;
    }
  }) as Effect<T>;
  initialized = true;
  node._effect = effect;
  node._modified = true;
  node._prevValue = initialValue;
  (node._queue = (node.parent as Owner)?._queue ?? globalQueue),
    (node._type = options?.render ? EFFECT_RENDER : EFFECT_USER);
  if (node._type === EFFECT_RENDER) {
    node.fn = p =>
      getClock() > node._queue.created && !node.error ? latest(() => compute(p)) : compute(p);
  }
  !options?.defer &&
    (node._type === EFFECT_USER
      ? node._queue.enqueue(node._type, runEffect.bind(node))
      : runEffect.call(node));
  onCleanup(() => node._cleanup?.());
  if (__DEV__ && !node.parent)
    console.warn("Effects created outside a reactive context will never be disposed");
}

function runEffect(this: Effect<any>) {
  if (!this._modified) return;
  this._cleanup?.();
  this._cleanup = undefined;
  try {
    this._cleanup = this._effect(this.error, this.value, this._prevValue) as any;
  } catch (e) {
    if (!this._queue.notify(this, ERROR_BIT, ERROR_BIT)) throw e;
  } finally {
    this._prevValue = this.value;
    this._modified = false;
  }
}
