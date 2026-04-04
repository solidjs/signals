type JudgmentLevel = "higher" | "same" | "lower";
type ClarityLevel = "high" | "medium" | "low";

export type FunctionSnapshot = {
  filePath: string;
  name: string;
  source: string;
};

export type SimplicityJudgment = {
  explanationClarity: ClarityLevel;
  semanticDirectness: JudgmentLevel;
  confidence: ClarityLevel;
  summary: string;
};

export type FunctionHeuristics = {
  lines: number;
  branchingCount: number;
  maxIndentDepth: number;
  mutableLocalCount: number;
  specialCaseCount: number;
  tryCatchCount: number;
  localHelperCount: number;
  booleanOperatorCount: number;
  returnCount: number;
};

export type FunctionDelta = {
  filePath: string;
  name: string;
  before: FunctionHeuristics;
  after: FunctionHeuristics;
  delta: MetricDelta;
};

export type MetricDelta = {
  lines: number;
  branchingCount: number;
  maxIndentDepth: number;
  mutableLocalCount: number;
  specialCaseCount: number;
  tryCatchCount: number;
  localHelperCount: number;
  booleanOperatorCount: number;
  returnCount: number;
};

export type SimplicityScorecard = {
  touchedFunctionCount: number;
  functionDeltas: FunctionDelta[];
  totals: MetricDelta;
  heuristicScore: number;
  judgment: SimplicityJudgment;
  improved: boolean;
  reasons: string[];
};

const KEYWORD_BRANCH_REGEX = /\bif\b|\belse\s+if\b|\bswitch\b|\bcase\b|\?[^:]+:/g;
const SPECIAL_CASE_REGEX = /\b(default|fallback|special|edge|boundary|pending|error|null|undefined)\b/g;
const MUTABLE_LOCAL_REGEX = /\b(let|var)\s+[A-Za-z_$][\w$]*/g;
const LOCAL_HELPER_REGEX = /\bfunction\s+[A-Za-z_$][\w$]*\s*\(|\bconst\s+[A-Za-z_$][\w$]*\s*=\s*\([^)]*\)\s*=>/g;
const BOOLEAN_OPERATOR_REGEX = /&&|\|\|/g;
const RETURN_REGEX = /\breturn\b/g;
const TRY_CATCH_REGEX = /\btry\b|\bcatch\b|\bfinally\b/g;

export function analyzeFunction(source: string): FunctionHeuristics {
  const lines = source
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  return {
    lines: lines.length,
    branchingCount: countMatches(source, KEYWORD_BRANCH_REGEX),
    maxIndentDepth: computeMaxIndentDepth(lines),
    mutableLocalCount: countMatches(source, MUTABLE_LOCAL_REGEX),
    specialCaseCount: countMatches(source, SPECIAL_CASE_REGEX),
    tryCatchCount: countMatches(source, TRY_CATCH_REGEX),
    localHelperCount: countMatches(source, LOCAL_HELPER_REGEX),
    booleanOperatorCount: countMatches(source, BOOLEAN_OPERATOR_REGEX),
    returnCount: countMatches(source, RETURN_REGEX),
  };
}

export function scoreSimplicity(
  before: FunctionSnapshot[],
  after: FunctionSnapshot[],
  judgment: SimplicityJudgment,
): SimplicityScorecard {
  const beforeByKey = new Map(before.map((snapshot) => [makeKey(snapshot), snapshot]));
  const afterByKey = new Map(after.map((snapshot) => [makeKey(snapshot), snapshot]));
  const keys = [...new Set([...beforeByKey.keys(), ...afterByKey.keys()])].sort();
  const functionDeltas: FunctionDelta[] = [];

  for (const key of keys) {
    const beforeSnapshot = beforeByKey.get(key);
    const afterSnapshot = afterByKey.get(key);
    if (!beforeSnapshot || !afterSnapshot) continue;
    const beforeMetrics = analyzeFunction(beforeSnapshot.source);
    const afterMetrics = analyzeFunction(afterSnapshot.source);
    functionDeltas.push({
      filePath: afterSnapshot.filePath,
      name: afterSnapshot.name,
      before: beforeMetrics,
      after: afterMetrics,
      delta: diffMetrics(beforeMetrics, afterMetrics),
    });
  }

  const totals = sumMetricDeltas(functionDeltas.map((entry) => entry.delta));
  const heuristicScore =
    scoreDelta(totals.branchingCount, 4) +
    scoreDelta(totals.maxIndentDepth, 4) +
    scoreDelta(totals.mutableLocalCount, 3) +
    scoreDelta(totals.specialCaseCount, 3) +
    scoreDelta(totals.tryCatchCount, 4) +
    scoreDelta(totals.localHelperCount, 2) +
    scoreDelta(totals.booleanOperatorCount, 1) +
    scoreDelta(totals.lines, 1) +
    scoreDelta(totals.returnCount, -1);

  const reasons = explainScore(totals, judgment, functionDeltas.length);
  const improved =
    heuristicScore > 0 &&
    judgment.semanticDirectness !== "lower" &&
    judgment.explanationClarity !== "low" &&
    judgment.confidence !== "low";

  return {
    touchedFunctionCount: functionDeltas.length,
    functionDeltas,
    totals,
    heuristicScore,
    judgment,
    improved,
    reasons,
  };
}

function makeKey(snapshot: FunctionSnapshot): string {
  return snapshot.filePath + "::" + snapshot.name;
}

function countMatches(source: string, regex: RegExp): number {
  return source.match(regex)?.length ?? 0;
}

function computeMaxIndentDepth(lines: string[]): number {
  let maxDepth = 0;
  for (const line of lines) {
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    maxDepth = Math.max(maxDepth, Math.floor(indent / 2));
  }
  return maxDepth;
}

function diffMetrics(before: FunctionHeuristics, after: FunctionHeuristics): MetricDelta {
  return {
    lines: after.lines - before.lines,
    branchingCount: after.branchingCount - before.branchingCount,
    maxIndentDepth: after.maxIndentDepth - before.maxIndentDepth,
    mutableLocalCount: after.mutableLocalCount - before.mutableLocalCount,
    specialCaseCount: after.specialCaseCount - before.specialCaseCount,
    tryCatchCount: after.tryCatchCount - before.tryCatchCount,
    localHelperCount: after.localHelperCount - before.localHelperCount,
    booleanOperatorCount: after.booleanOperatorCount - before.booleanOperatorCount,
    returnCount: after.returnCount - before.returnCount,
  };
}

function sumMetricDeltas(deltas: MetricDelta[]): MetricDelta {
  return deltas.reduce<MetricDelta>(
    (total, delta) => ({
      lines: total.lines + delta.lines,
      branchingCount: total.branchingCount + delta.branchingCount,
      maxIndentDepth: total.maxIndentDepth + delta.maxIndentDepth,
      mutableLocalCount: total.mutableLocalCount + delta.mutableLocalCount,
      specialCaseCount: total.specialCaseCount + delta.specialCaseCount,
      tryCatchCount: total.tryCatchCount + delta.tryCatchCount,
      localHelperCount: total.localHelperCount + delta.localHelperCount,
      booleanOperatorCount: total.booleanOperatorCount + delta.booleanOperatorCount,
      returnCount: total.returnCount + delta.returnCount,
    }),
    {
      lines: 0,
      branchingCount: 0,
      maxIndentDepth: 0,
      mutableLocalCount: 0,
      specialCaseCount: 0,
      tryCatchCount: 0,
      localHelperCount: 0,
      booleanOperatorCount: 0,
      returnCount: 0,
    },
  );
}

function scoreDelta(delta: number, weight: number): number {
  return delta === 0 ? 0 : delta < 0 ? Math.abs(delta) * weight : -delta * weight;
}

function explainScore(
  totals: MetricDelta,
  judgment: SimplicityJudgment,
  touchedFunctionCount: number,
): string[] {
  const reasons: string[] = [];
  if (totals.branchingCount < 0) reasons.push("fewer branches in touched functions");
  if (totals.maxIndentDepth < 0) reasons.push("lower nesting depth");
  if (totals.mutableLocalCount < 0) reasons.push("fewer mutable locals");
  if (totals.specialCaseCount < 0) reasons.push("fewer special-case paths");
  if (totals.tryCatchCount < 0) reasons.push("less exception-flow complexity");
  if (totals.localHelperCount < 0) reasons.push("less local indirection");
  if (totals.lines < 0 && reasons.length === 0) reasons.push("smaller touched-function footprint");
  if (judgment.semanticDirectness === "higher") reasons.push("reviewer judged logic as more direct");
  if (judgment.explanationClarity === "high") reasons.push("change is easy to explain in one sentence");
  if (touchedFunctionCount > 1) reasons.push(`spread across ${touchedFunctionCount} touched functions`);
  if (reasons.length === 0) reasons.push("no strong simplicity signal detected");
  return reasons;
}
