import { createEffect, createMemo, createRoot, createSignal, flush } from "../src/index.js";

afterEach(() => flush());

it("coalesces multiple source writes into one downstream effect run", () => {
  const effect = vi.fn();
  let setX!: (value: number) => number;
  let setY!: (value: number) => number;

  createRoot(() => {
    const [$x, _setX] = createSignal(1);
    const [$y, _setY] = createSignal(2);
    const $sum = createMemo(() => $x() + $y());

    setX = _setX;
    setY = _setY;

    createEffect($sum, effect);
  });

  flush();
  expect(effect).toHaveBeenCalledTimes(1);
  expect(effect).toHaveBeenLastCalledWith(3, undefined);

  setX(10);
  setY(20);
  setX(11);

  expect(effect).toHaveBeenCalledTimes(1);

  flush();
  expect(effect).toHaveBeenCalledTimes(2);
  expect(effect).toHaveBeenLastCalledWith(31, 3);
});

it("switches dependencies within a batch before notifying downstream effects", () => {
  const effect = vi.fn();
  let setCondition!: (value: boolean) => boolean;
  let setX!: (value: number) => number;
  let setY!: (value: number) => number;

  createRoot(() => {
    const [$condition, _setCondition] = createSignal(true);
    const [$x, _setX] = createSignal(0);
    const [$y, _setY] = createSignal(0);
    const $selected = createMemo(() => ($condition() ? $x() : $y()));

    setCondition = _setCondition;
    setX = _setX;
    setY = _setY;

    createEffect($selected, effect);
  });

  flush();
  expect(effect).toHaveBeenCalledTimes(1);
  expect(effect).toHaveBeenLastCalledWith(0, undefined);

  setX(1);
  setCondition(false);
  setY(2);
  flush();

  expect(effect).toHaveBeenCalledTimes(2);
  expect(effect).toHaveBeenLastCalledWith(2, 0);

  setX(3);
  flush();
  expect(effect).toHaveBeenCalledTimes(2);

  setY(4);
  flush();
  expect(effect).toHaveBeenCalledTimes(3);
  expect(effect).toHaveBeenLastCalledWith(4, 2);
});

it("does not run queued effects after the owning root is disposed", () => {
  const effect = vi.fn();
  let dispose!: () => void;
  let setX!: (value: number) => number;

  dispose = createRoot(rootDispose => {
    const [$x, _setX] = createSignal(0);
    setX = _setX;
    createEffect($x, effect);
    return rootDispose;
  });

  flush();
  expect(effect).toHaveBeenCalledTimes(1);
  expect(effect).toHaveBeenLastCalledWith(0, undefined);

  setX(1);
  dispose();
  flush();

  expect(effect).toHaveBeenCalledTimes(1);
});
