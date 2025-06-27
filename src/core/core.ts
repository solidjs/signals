import { effect } from "./effect.js";
import { NotReadyError } from "./error.js";
import { createRoot, getNextChildId, getOwner } from "./owner.js";
import { stabilize } from "./scheduler.js";
import {
  asyncComputed,
  computed,
  dispose,
  read,
  setSignal,
  signal,
  untrack,
  type AsyncSignal,
  type Computed,
  type SignalOptions as R3SignalOptions
} from "./r3.js";

export { onCleanup, untrack, isEqual, type Disposable } from "./r3.js";

export interface SignalOptions<T> extends R3SignalOptions<T> {
  id?: string;
  name?: string;
}

export type Accessor<T> = () => T;

export type Setter<in out T> = {
  <U extends T>(
    ...args: undefined extends T ? [] : [value: Exclude<U, Function> | ((prev: T) => U)]
  ): undefined extends T ? undefined : U;
  <U extends T>(value: (prev: T) => U): U;
  <U extends T>(value: Exclude<U, Function>): U;
  <U extends T>(value: Exclude<U, Function> | ((prev: T) => U)): U;
};

export type Signal<T> = [get: Accessor<T>, set: Setter<T>];

export type ComputeFunction<Prev, Next extends Prev = Prev> = (v: Prev) => Next;
export type EffectFunction<Prev, Next extends Prev = Prev> = (
  err: unknown,
  v: Next,
  p?: Prev
) => (() => void) | void;
export type RenderEffectFunction<Prev, Next extends Prev = Prev> = (
  v: Next,
  p?: Prev
) => (() => void) | void;

export interface EffectOptions {
  name?: string;
  defer?: boolean;
}
export interface MemoOptions<T> {
  name?: string;
  equals?: false | ((prev: T, next: T) => boolean);
}

// Magic type that when used at sites where generic types are inferred from, will prevent those sites from being involved in the inference.
// https://github.com/microsoft/TypeScript/issues/14829
// TypeScript Discord conversation: https://discord.com/channels/508357248330760243/508357248330760249/911266491024949328
export type NoInfer<T extends any> = [T][T extends any ? 0 : never];

/**
 * Creates a simple reactive state with a getter and setter
 * ```typescript
 * const [state: Accessor<T>, setState: Setter<T>] = createSignal<T>(
 *  value: T,
 *  options?: { name?: string, equals?: false | ((prev: T, next: T) => boolean) }
 * )
 * ```
 * @param value initial value of the state; if empty, the state's type will automatically extended with undefined; otherwise you need to extend the type manually if you want setting to undefined not be an error
 * @param options optional object with a name for debugging purposes and equals, a comparator function for the previous and next value to allow fine-grained control over the reactivity
 *
 * @returns ```typescript
 * [state: Accessor<T>, setState: Setter<T>]
 * ```
 * * the Accessor is a function that returns the current value and registers each call to the reactive root
 * * the Setter is a function that allows directly setting or mutating the value:
 * ```typescript
 * const [count, setCount] = createSignal(0);
 * setCount(count => count + 1);
 * ```
 *
 * @description https://docs.solidjs.com/reference/basic-reactivity/create-signal
 */
export function createSignal<T>(): Signal<T | undefined>;
export function createSignal<T>(value: Exclude<T, Function>, options?: SignalOptions<T>): Signal<T>;
export function createSignal<T>(
  fn: ComputeFunction<T>,
  initialValue?: T,
  options?: SignalOptions<T>
): Signal<T>;
export function createSignal<T>(
  first?: T | ComputeFunction<T>,
  second?: T | SignalOptions<T>,
  third?: SignalOptions<T>
): Signal<T | undefined> {
  if (typeof first === "function") {
    const memo = createMemo<Signal<T>>(p => {
      const node = signal<T>((first as (prev?: T) => T)(p ? untrack(p[0]) : (second as T)), third);
      return [() => read(node), v => setSignal(node, v)] as Signal<T>;
    });
    return [() => memo()[0](), (value => memo()[1](value)) as Setter<T | undefined>];
  }
  const o = getOwner();
  const needsId = o?.id != null;
  const node = signal(
    first as T,
    needsId ? { id: getNextChildId(o), ...second } : (second as SignalOptions<T>)
  );
  return [() => read(node), (v => setSignal(node, v)) as Setter<T | undefined>];
}

/**
 * Creates a readonly derived reactive memoized signal
 * ```typescript
 * export function createMemo<T>(
 *   compute: (v: T) => T,
 *   value?: T,
 *   options?: { name?: string, equals?: false | ((prev: T, next: T) => boolean) }
 * ): () => T;
 * ```
 * @param compute a function that receives its previous or the initial value, if set, and returns a new value used to react on a computation
 * @param value an optional initial value for the computation; if set, fn will never receive undefined as first argument
 * @param options allows to set a name in dev mode for debugging purposes and use a custom comparison function in equals
 *
 * @description https://docs.solidjs.com/reference/basic-reactivity/create-memo
 */
// The extra Prev generic parameter separates inference of the compute input
// parameter type from inference of the compute return type, so that the effect
// return type is always used as the memo Accessor's return type.
export function createMemo<Next extends Prev, Prev = Next>(
  compute: ComputeFunction<undefined | NoInfer<Prev>, Next>
): Accessor<Next>;
export function createMemo<Next extends Prev, Init = Next, Prev = Next>(
  compute: ComputeFunction<Init | Prev, Next>,
  value: Init,
  options?: MemoOptions<Next>
): Accessor<Next>;
export function createMemo<Next extends Prev, Init, Prev>(
  compute: ComputeFunction<Init | Prev, Next>,
  value?: Init,
  options?: MemoOptions<Next>
): Accessor<Next> {
  let node: Computed<Next> | undefined = computed<Next>(compute as any, value as any, options);
  let resolvedValue: Next;
  return () => {
    if (node) {
      stabilize();
      resolvedValue = read(node);
      // no sources so will never update so can be disposed.
      // additionally didn't create nested reactivity so can be disposed.
      if (!node.deps && !node.firstChild) {
        dispose(node);
        node = undefined;
      }
    }
    return resolvedValue;
  };
}

/**
 * Creates a readonly derived async reactive memoized signal
 * ```typescript
 * export function createAsync<T>(
 *   compute: (v: T) => Promise<T> | T,
 *   value?: T,
 *   options?: { name?: string, equals?: false | ((prev: T, next: T) => boolean) }
 * ): () => T;
 * ```
 * @param compute a function that receives its previous or the initial value, if set, and returns a new value used to react on a computation
 * @param value an optional initial value for the computation; if set, fn will never receive undefined as first argument
 * @param options allows to set a name in dev mode for debugging purposes and use a custom comparison function in equals
 *
 * @description https://docs.solidjs.com/reference/basic-reactivity/create-async
 */
export function createAsync<T>(
  compute: (prev?: T) => Promise<T> | T,
  value?: T,
  options?: SignalOptions<T>
): Accessor<T> {
  const node: AsyncSignal<T> = asyncComputed<T>(
    () => compute(node.loaded.value as T),
    value,
    options as SignalOptions<any>
  );
  return () => {
    if (read(node.loading)) throw new NotReadyError();
    return read(node.loaded) as T;
  };
}

/**
 * Creates a reactive effect that runs after the render phase
 * ```typescript
 * export function createEffect<T>(
 *   compute: (prev: T) => T,
 *   effect: (err: unknown, v: T, prev: T) => (() => void) | void,
 *   value?: T,
 *   options?: { name?: string }
 * ): void;
 * ```
 * @param compute a function that receives its previous or the initial value, if set, and returns a new value used to react on a computation
 * @param effect a function that receives the new value and is used to perform side effects, return a cleanup function to run on disposal
 * @param value an optional initial value for the computation; if set, fn will never receive undefined as first argument
 * @param options allows to set a name in dev mode for debugging purposes
 *
 * @description https://docs.solidjs.com/reference/basic-reactivity/create-effect
 */
export function createEffect<Next>(
  compute: ComputeFunction<undefined | NoInfer<Next>, Next>,
  effect: EffectFunction<NoInfer<Next>, Next>,
  error?: (err: unknown) => void
): void;
export function createEffect<Next, Init = Next>(
  compute: ComputeFunction<Init | Next, Next>,
  effect: EffectFunction<Next, Next>,
  error: ((err: unknown) => void) | undefined,
  value: Init,
  options?: EffectOptions
): void;
export function createEffect<Next, Init>(
  compute: ComputeFunction<Init | Next, Next>,
  effectFn: EffectFunction<Next, Next>,
  value?: Init,
  options?: EffectOptions
): void {
  effect(
    compute as any,
    effectFn,
    value as any,
    __DEV__ ? { ...options, name: options?.name ?? "effect" } : options
  );
}

/**
 * Creates a reactive computation that runs during the render phase as DOM elements are created and updated but not necessarily connected
 * ```typescript
 * export function createRenderEffect<T>(
 *   compute: (prev: T) => T,
 *   effect: (v: T, prev: T) => (() => void) | void,
 *   value?: T,
 *   options?: { name?: string }
 * ): void;
 * ```
 * @param compute a function that receives its previous or the initial value, if set, and returns a new value used to react on a computation
 * @param effect a function that receives the new value and is used to perform side effects
 * @param value an optional initial value for the computation; if set, fn will never receive undefined as first argument
 * @param options allows to set a name in dev mode for debugging purposes
 *
 * @description https://docs.solidjs.com/reference/secondary-primitives/create-render-effect
 */
export function createRenderEffect<Next>(
  compute: ComputeFunction<undefined | NoInfer<Next>, Next>,
  effect: RenderEffectFunction<NoInfer<Next>, Next>
): void;
export function createRenderEffect<Next, Init = Next>(
  compute: ComputeFunction<Init | Next, Next>,
  effect: RenderEffectFunction<Next, Next>,
  value: Init,
  options?: EffectOptions
): void;
export function createRenderEffect<Next, Init>(
  compute: ComputeFunction<Init | Next, Next>,
  effectFn: RenderEffectFunction<Next, Next>,
  value?: Init,
  options?: EffectOptions
): void {
  effect(compute as any, (e, v, p) => effectFn(v, p), value as any, {
    render: true,
    ...(__DEV__ ? { ...options, name: options?.name ?? "rendereffect" } : options)
  });
}

/**
 * Returns a promise of the resolved value of a reactive expression
 * @param fn a reactive expression to resolve
 */
export function resolve<T>(fn: () => T): Promise<T> {
  return new Promise((res, rej) => {
    createRoot(dispose => {
      computed(() => {
        try {
          res(fn());
        } catch (err) {
          if (err instanceof NotReadyError) throw err;
          rej(err);
        }
        dispose();
      });
    });
  });
}

export type TryCatchResult<T, E> = [undefined, T] | [E];
export function tryCatch<T, E = Error>(fn: () => Promise<T>): Promise<TryCatchResult<T, E>>;
export function tryCatch<T, E = Error>(fn: () => T): TryCatchResult<T, E>;
export function tryCatch<T, E = Error>(
  fn: () => T | Promise<T>
): TryCatchResult<T, E> | Promise<TryCatchResult<T, E>> {
  try {
    const v = fn();
    if (v instanceof Promise) {
      return v.then(
        v => [undefined, v],
        e => {
          if (e instanceof NotReadyError) throw e;
          return [e as E];
        }
      );
    }
    return [undefined, v];
  } catch (e) {
    if (e instanceof NotReadyError) throw e;
    return [e as E];
  }
}

/**
 * Returns true if the given functinon contains signals that have been updated since the last time
 * the parent computation was run.
 */
export function hasUpdated(fn: () => any): boolean {
  return false; // TODO: Implement hasUpdated function

  // const current = updateCheck;
  // updateCheck = { _value: false };
  // try {
  //   fn();
  //   return updateCheck._value;
  // } finally {
  //   updateCheck = current;
  // }
}

// function pendingCheck(fn: () => any, loadingValue: boolean | undefined): boolean {
//   const current = staleCheck;
//   staleCheck = { _value: false };
//   try {
//     latest(fn);
//     return staleCheck._value;
//   } catch (err) {
//     if (!(err instanceof NotReadyError)) return false;
//     if (loadingValue !== undefined) return loadingValue!;
//     throw err;
//   } finally {
//     staleCheck = current;
//   }
// }

/**
 * Returns an accessor that is true if the given function contains async signals that are out of date.
 */
export function isPending(fn: () => any): boolean;
export function isPending(fn: () => any, loadingValue: boolean): boolean;
export function isPending(fn: () => any, loadingValue?: boolean): boolean {
  return false; // TODO: Implement isPending function

  // if (!currentObserver) return pendingCheck(fn, loadingValue);
  // const c = new Computation(undefined, () => pendingCheck(fn, loadingValue));
  // c._handlerMask |= LOADING_BIT;
  // return c.read();
}

/**
 * Attempts to resolve value of expression synchronously returning the last resolved value for any async computation.
 */
export function latest<T>(fn: () => T): T;
export function latest<T, U>(fn: () => T, fallback: U): T | U;
export function latest<T, U>(fn: () => T, fallback?: U): T | U {
  return {} as any; // TODO: Implement latest function

  // const argLength = arguments.length;
  // const prevFlags = newFlags;
  // const prevNotStale = notStale;
  // notStale = false;
  // try {
  //   return fn();
  // } catch (err) {
  //   if (argLength > 1 && err instanceof NotReadyError) return fallback as U;
  //   throw err;
  // } finally {
  //   newFlags = prevFlags;
  //   notStale = prevNotStale;
  // }
}
