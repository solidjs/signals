Work in @solid/signals/  on the current branch.

Task:
Find and implement exactly one small simplification in the internal reactive core, limited to these files only:
- src/core/scheduler.ts
- src/core/graph.ts
- src/core/heap.ts
- src/signals.ts

Goal:
Make the code meaningfully simpler while preserving behavior. Simplicity is the primary objective. Performance is a constraint, not the target.

Constraints:
- no public API changes
- no new dependencies
- no edits outside the allowed files
- one idea only, not a bundle of cleanup changes
- prefer removing complexity over introducing new abstractions
- avoid broad refactors; choose the smallest correct change

Required process:
1. Read the relevant code in the allowed files and identify one concrete simplification opportunity.
2. Implement the change.
3. Run these verification commands in @solid/signals:
   - pnpm test
   - pnpm build
   - pnpm exec vitest bench --run tests/core/reactivity.bench.ts
4. Evaluate the result with this keep/discard rule:
   - discard if tests fail
   - discard if build fails
   - discard if the benchmark shows a meaningful regression
   - discard if the result is not clearly simpler
   - keep only if the change is small, behavior-preserving, and obviously simpler
5. Make a clean descriptive git commit describing the simplification made and why

If your simplification could plausibly affect semantics, add a focused unit test that captures the intended invariant and verify it passes with the final change.

Use `research/simplicity.md` as the simplicity scoring rubric when deciding whether the result is clearly simpler.

Output:
- a brief description of the simplification you chose
- the exact files changed
- test/build/bench results
- a final keep-or-discard recommendation with a short reason focused on simplicity
