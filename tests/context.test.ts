import { createEffect, createRoot, getContext, setContext } from "../src";

it("should get context value", () => {
  const key = Symbol();
  createRoot(() => {
    setContext(key, 100);

    createRoot(() => {
      createRoot(() => {
        setContext(key, 200);
      });

      createEffect(() => {
        expect(getContext(key)).toBe(100);
      });
    });
  });
});

it("should not throw if no context value is found", () => {
  const key = Symbol();
  createRoot(() => {
    createRoot(() => {
      createEffect(() => {
        expect(getContext(key)).toBe(undefined);
      });
    });
  });
});
