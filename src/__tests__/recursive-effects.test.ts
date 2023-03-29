import { describe, it, expect, test } from "vitest";

import { createEffect, createRoot, untrack, createStore, unwrap, flushSync, createSignal, createMemo } from "../";
import { sharedClone } from "./sharedClone";

describe("recursive effects", () => {
  it("can track deeply with cloning", () => {
    const [store, setStore] = createStore({ foo: "foo", bar: { baz: "baz" } });

    let called = 0;
    let next: any;

    createRoot(() => {
      createEffect(() => {
        next = sharedClone(next, store);
        called++;
      });
    });

    setStore((s) => {
      s.foo = "1";
    });

    setStore((s) => {
      s.bar.baz = "2";
    });

    flushSync();
    expect(called).toBe(2);
  });

  it("respects untracked", () => {
    const [store, setStore] = createStore({ foo: "foo", bar: { baz: "baz" } });

    let called = 0;
    let next: any;

    createRoot(() => {
      createEffect(() => {
        next = sharedClone(next, untrack(() => store).bar);
        called++;
      });
    });

    setStore((s) => {
      s.foo = "1";
    });

    setStore((s) => {
      s.bar.baz = "2";
    });

    setStore((s) => {
      s.bar = {
        baz: "3",
      };
    });

    flushSync();
    expect(called).toBe(2);
  });

  it("supports unwrapped values", () => {
    const [store, setStore] = createStore({ foo: "foo", bar: { baz: "baz" } });

    let called = 0;
    let prev: any;
    let next: any;

    createRoot(() => {
      createEffect(() => {
        prev = next;
        next = unwrap(sharedClone(next, store));
        called++;
      });
    });

    setStore((s) => {
      s.foo = "1";
    });

    setStore((s) => {
      s.bar.baz = "2";
    });

    flushSync();
    expect(next).not.toBe(prev);
    expect(called).toBe(2);
  });

  it("runs parent effects before child effects", () => {
    const [x,setX] = createSignal(0);
    const simpleM = createMemo(() => x());
    let calls = 0;
    createEffect(() => {
      createEffect(() => {
        console.log("child", x());
        calls++;
      });
      console.log("parent", simpleM());
    });
    setX(1);
    flushSync();
    expect(calls).toBe(2);
  });
});
