import { EFFECT_RENDER, EFFECT_USER } from "./constants.js";
import { stabilize as r3Stabilize } from "./r3.js";

let clock = 0;
export function getClock() {
  return clock;
}
export function incrementClock(): void {
  clock++;
}

let scheduled = false;
export function stabilize() {
  r3Stabilize();
  if (scheduled) return;
  scheduled = true;
  if (!globalQueue._running) queueMicrotask(flushSync);
}

type QueueCallback = (type: number) => void;
export interface IQueue {
  enqueue(type: number, fn: QueueCallback): void;
  run(type: number): boolean | void;
  flush(): void;
  addChild(child: IQueue): void;
  removeChild(child: IQueue): void;
  created: number;
  notify(...args: any[]): boolean;
  _parent: IQueue | null;
}

export class Queue implements IQueue {
  _parent: IQueue | null = null;
  _running: boolean = false;
  _queues: [QueueCallback[], QueueCallback[]] = [[], []];
  _children: IQueue[] = [];
  created = clock;
  enqueue(type: number, fn: QueueCallback): void {
    this._queues[type].push(fn);
  }
  run(type: number) {
    if (this._queues[type].length) {
      const effects = this._queues[type];
      this._queues[type] = [];
      runQueue(effects, type);
    }
    for (let i = 0; i < this._children.length; i++) {
      this._children[i].run(type);
    }
  }
  flush() {
    if (this._running) return;
    this._running = true;
    try {
      r3Stabilize();
      incrementClock();
      scheduled = false;
      this.run(EFFECT_RENDER);
      this.run(EFFECT_USER);
    } finally {
      this._running = false;
    }
  }
  addChild(child: IQueue) {
    this._children.push(child);
    child._parent = this;
  }
  removeChild(child: IQueue) {
    const index = this._children.indexOf(child);
    if (index >= 0) this._children.splice(index, 1);
  }
  notify(...args: any[]) {
    if (this._parent) return this._parent.notify(...args);
    return false;
  }
}

export const globalQueue = new Queue();

/**
 * By default, changes are batched on the microtask queue which is an async process. You can flush
 * the queue synchronously to get the latest updates by calling `flushSync()`.
 */
export function flushSync(): void {
  let count = 0;
  while (scheduled) {
    if (__DEV__ && ++count === 1e5) throw new Error("Potential Infinite Loop Detected.");
    globalQueue.flush();
  }
}

function runQueue(queue: QueueCallback[], type: number): void {
  for (let i = 0; i < queue.length; i++) queue[i](type);
}
