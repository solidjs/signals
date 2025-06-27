import { ContextNotFoundError, NoOwnerError } from "./error.js";
import { dispose, getContext as getR3Owner, getTracking, runWithContext, untrack, type Computed, type Owner as R3Owner } from "./r3.js";
import { globalQueue, type IQueue } from "./scheduler.js";

export interface Owner extends R3Owner {
  id: string | undefined;
  _context: Record<symbol, unknown>;
  _childCount: number;
  _queue: IQueue;
}

export interface Context<T> {
  readonly id: symbol;
  readonly defaultValue: T | undefined;
}

export type ContextRecord = Record<string | symbol, unknown>;

/**
 * Creates a new non-tracked reactive context with manual disposal
 *
 * @param fn a function in which the reactive state is scoped
 * @returns the output of `fn`.
 *
 * @description https://docs.solidjs.com/reference/reactive-utilities/create-root
 */
export function createRoot<T>(
  init: ((dispose: () => void) => T) | (() => T),
  options?: { id: string }
): T {
  const parent = getOwner();
  const owner = {
    id: options?.id ?? (parent?.id ? getNextChildId(parent) : undefined),
    _queue: parent?._queue ?? globalQueue,
    _context: parent?._context,
    _childCount: 0
  } as Computed<T> & Owner;

  if (parent) {
    const lastChild = parent.firstChild;
    if (lastChild === null) {
      parent.firstChild = owner;
    } else {
      owner.nextSibling = lastChild;
      parent.firstChild = owner;
    }
  }
  return runWithOwner(owner, !init.length ? (init as () => T) : () => init(() => dispose(owner)));
}

export function getObserver(): Owner | null {
  return getTracking() ? getOwner() : null;
}

export function getOwner(): Owner | null {
  return getR3Owner() as Owner | null;
}

/**
 * Runs the given function in the given owner to move ownership of nested primitives and cleanups.
 * This method untracks the current scope.
 *
 * Warning: Usually there are simpler ways of modeling a problem that avoid using this function
 */
export function runWithOwner<T>(owner: Owner, fn: () => T): T {
  return runWithContext(owner as Computed<T> & Owner, () => untrack(fn));
}

/**
 * Runs the given function in the given observer.
 *
 * Warning: Usually there are simpler ways of modeling a problem that avoid using this function
 */
export function runWithObserver<T>(observer: Owner, fn: () => T): T | undefined {
  return runWithContext(observer as Computed<T> & Owner, fn)
}

/**
 * Context provides a form of dependency injection. It is used to save from needing to pass
 * data as props through intermediate components. This function creates a new context object
 * that can be used with `getContext` and `setContext`.
 *
 * A default value can be provided here which will be used when a specific value is not provided
 * via a `setContext` call.
 */
export function createContext<T>(defaultValue?: T, description?: string): Context<T> {
  return { id: Symbol(description), defaultValue };
}

/**
 * Attempts to get a context value for the given key.
 *
 * @throws `NoOwnerError` if there's no owner at the time of call.
 * @throws `ContextNotFoundError` if a context value has not been set yet.
 */
export function getContext<T>(context: Context<T>, owner: Owner | null = getOwner()): T {
  if (!owner) {
    throw new NoOwnerError();
  }

  const value = hasContext(context, owner)
    ? (owner._context[context.id] as T)
    : context.defaultValue;

  if (isUndefined(value)) {
    throw new ContextNotFoundError();
  }

  return value;
}

/**
 * Attempts to set a context value on the parent scope with the given key.
 *
 * @throws `NoOwnerError` if there's no owner at the time of call.
 */
export function setContext<T>(context: Context<T>, value?: T, owner: Owner | null = getOwner()) {
  if (!owner) {
    throw new NoOwnerError();
  }

  // We're creating a new object to avoid child context values being exposed to parent owners. If
  // we don't do this, everything will be a singleton and all hell will break lose.
  owner._context = {
    ...owner._context,
    [context.id]: isUndefined(value) ? context.defaultValue : value
  };
}

function hasContext(context: Context<any>, owner: Owner): boolean {
  return !isUndefined(owner?._context[context.id]);
}

function isUndefined(value: any): value is undefined {
  return typeof value === "undefined";
}

export function getNextChildId(owner: Owner): string {
  if (owner.id != null) return formatId(owner.id, owner._childCount++);
  throw new Error("Cannot get child id from owner without an id");
}

function formatId(prefix: string, id: number) {
  const num = id.toString(36),
    len = num.length - 1;
  return prefix + (len ? String.fromCharCode(64 + len) : "") + num;
}
