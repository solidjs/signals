# Simplicity Scoring

The research loop should not treat fewer lines as the definition of simplicity. Instead, it should score a candidate with a small heuristic scorecard and combine that with an explicit reviewer judgment.

## Why This Shape

- raw LOC is too noisy
- cyclomatic complexity alone misses indirection and state-surface changes
- a simplification should usually reduce branching, nesting, mutable temporaries, or special cases
- a reviewer still needs to confirm that the new code is more direct to understand

## Inputs

The scorer compares only the touched functions before and after a candidate change.

Each touched function should provide:

- `filePath`
- `name`
- `source`

The caller should also provide a reviewer judgment:

- `explanationClarity`: `high | medium | low`
- `semanticDirectness`: `higher | same | lower`
- `confidence`: `high | medium | low`
- `summary`: one-sentence explanation of why the code is simpler or not

## Heuristics

For each touched function, `research/simplicity.ts` computes:

- `lines`
- `branchingCount`
- `maxIndentDepth`
- `mutableLocalCount`
- `specialCaseCount`
- `tryCatchCount`
- `localHelperCount`
- `booleanOperatorCount`
- `returnCount`

These are intentionally simple source-level heuristics for v1. They are not a full parser-backed semantic metric.

## Scoring Rules

The score should reward reductions in:

- branches
- nesting depth
- mutable locals
- special-case handling
- try/catch flow
- local helper indirection

It should lightly reward reduced line count.

It should not automatically penalize extra `return` statements because early returns often simplify code; `returnCount` should be treated as a weak signal only.

## Acceptance Rule

A candidate counts as a simplicity improvement only if all are true:

1. heuristic score is positive
2. reviewer says semantic directness is not lower
3. explanation clarity is not low
4. reviewer confidence is not low

This is intentionally conservative. The loop should prefer false negatives over accepting noisy simplifications.

## Example Output

```json
{
  "touchedFunctionCount": 1,
  "totals": {
    "lines": -3,
    "branchingCount": -1,
    "maxIndentDepth": -1,
    "mutableLocalCount": 0,
    "specialCaseCount": 0,
    "tryCatchCount": 0,
    "localHelperCount": 0,
    "booleanOperatorCount": 0,
    "returnCount": 1
  },
  "heuristicScore": 8,
  "judgment": {
    "explanationClarity": "high",
    "semanticDirectness": "higher",
    "confidence": "high",
    "summary": "This removes one null-guard branch and makes the main path linear."
  },
  "improved": true,
  "reasons": [
    "fewer branches in touched functions",
    "lower nesting depth",
    "reviewer judged logic as more direct",
    "change is easy to explain in one sentence"
  ]
}
```

## Loop Integration

The loop should use the scorer after candidate evaluation and before final accept/reject:

1. identify touched functions in the allowed files
2. capture their source before and after the candidate
3. run `scoreSimplicity(before, after, judgment)`
4. reject if `improved` is false
5. include the scorecard in the recorded result JSON

## Important Limits

- The heuristics are useful only for small local edits.
- They should not be treated as a universal code quality metric.
- If a candidate may change behavior, a focused unit test still matters more than the simplicity score.
