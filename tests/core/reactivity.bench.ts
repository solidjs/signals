import { bench } from "vitest";
import { createEffect, createMemo, createRoot, createSignal, flush } from "../../src/index.js";

const filter = new RegExp(process.env.FILTER || ".+");

function registerBench(title: string, fn: () => void) {
  if (filter.test(title)) {
    bench(title, fn);
  }
}

registerBench("reactivity: fanout update", () => {
  let setSource!: (value: number) => number;

  const dispose = createRoot(dispose => {
    const [$source, _setSource] = createSignal(0);
    const memos = Array.from({ length: 50 }, (_, index) => createMemo(() => $source() + index));
    const $sink = createMemo(() => {
      let total = 0;
      for (const memo of memos) total += memo();
      return total;
    });

    setSource = _setSource;
    createEffect($sink, () => {});
    return dispose;
  });

  flush();
  setSource(1);
  flush();
  dispose();
  flush();
});

registerBench("reactivity: diamond propagation", () => {
  let setSource!: (value: number) => number;

  const dispose = createRoot(dispose => {
    const [$source, _setSource] = createSignal(0);
    const $left = createMemo(() => $source() + 1);
    const $right = createMemo(() => $source() + 2);
    const $diamond = createMemo(() => $left() + $right());

    setSource = _setSource;
    createEffect($diamond, () => {});
    return dispose;
  });

  flush();
  setSource(1);
  flush();
  dispose();
  flush();
});

registerBench("reactivity: dynamic dependency switch", () => {
  let setCondition!: (value: boolean) => boolean;
  let setLeft!: (value: number) => number;
  let setRight!: (value: number) => number;

  const dispose = createRoot(dispose => {
    const [$condition, _setCondition] = createSignal(true);
    const [$left, _setLeft] = createSignal(0);
    const [$right, _setRight] = createSignal(0);
    const $selected = createMemo(() => ($condition() ? $left() : $right()));

    setCondition = _setCondition;
    setLeft = _setLeft;
    setRight = _setRight;
    createEffect($selected, () => {});
    return dispose;
  });

  flush();
  setLeft(1);
  setCondition(false);
  setRight(1);
  flush();
  dispose();
  flush();
});
