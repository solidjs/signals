import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const PROGRAM_PATH = path.join(ROOT_DIR, "research", "program.md");

const KEYWORD_BRANCH_REGEX = /\bif\b|\belse\s+if\b|\bswitch\b|\bcase\b|\?[^:]+:/g;
const SPECIAL_CASE_REGEX = /\b(default|fallback|special|edge|boundary|pending|error|null|undefined)\b/g;
const MUTABLE_LOCAL_REGEX = /\b(let|var)\s+[A-Za-z_$][\w$]*/g;
const LOCAL_HELPER_REGEX = /\bfunction\s+[A-Za-z_$][\w$]*\s*\(|\bconst\s+[A-Za-z_$][\w$]*\s*=\s*\([^)]*\)\s*=>/g;
const BOOLEAN_OPERATOR_REGEX = /&&|\|\|/g;
const RETURN_REGEX = /\breturn\b/g;
const TRY_CATCH_REGEX = /\btry\b|\bcatch\b|\bfinally\b/g;

if (!existsSync(PROGRAM_PATH)) {
  console.error(`Missing research program: ${PROGRAM_PATH}`);
  process.exit(1);
}

const allowedFiles = parseAllowedFiles(readFileSync(PROGRAM_PATH, "utf8"));
const changedFiles = getChangedAllowedFiles(allowedFiles);

if (changedFiles.length === 0) {
  console.log(
    JSON.stringify(
      {
        comparedAgainst: "HEAD",
        changedFiles: [],
        heuristicScore: 0,
        message: "No changed allowed files to compare.",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const files = changedFiles.map((filePath) => {
  const beforeSource = readGitFile(filePath);
  const afterSource = readWorkingFile(filePath);
  const before = analyzeSource(beforeSource);
  const after = analyzeSource(afterSource);
  const delta = diffMetrics(before, after);

  return {
    filePath,
    before,
    after,
    delta,
    heuristicScore: scoreMetrics(delta),
  };
});

const totals = sumMetricDeltas(files.map((file) => file.delta));

console.log(
  JSON.stringify(
    {
      comparedAgainst: "HEAD",
      changedFiles,
      totals,
      heuristicScore: scoreMetrics(totals),
      files,
    },
    null,
    2,
  ),
);

function parseAllowedFiles(programText) {
  return programText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- src/"))
    .map((line) => line.slice(2));
}

function getChangedAllowedFiles(allowedFiles) {
  const output = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMRTUXB", "HEAD", "--", ...allowedFiles], {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function readGitFile(filePath) {
  try {
    return execFileSync("git", ["show", `HEAD:${filePath}`], {
      cwd: ROOT_DIR,
      encoding: "utf8",
    });
  } catch {
    return "";
  }
}

function readWorkingFile(filePath) {
  const absolutePath = path.join(ROOT_DIR, filePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

function analyzeSource(source) {
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

function countMatches(source, regex) {
  return source.match(regex)?.length ?? 0;
}

function computeMaxIndentDepth(lines) {
  let maxDepth = 0;
  for (const line of lines) {
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    maxDepth = Math.max(maxDepth, Math.floor(indent / 2));
  }
  return maxDepth;
}

function diffMetrics(before, after) {
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

function sumMetricDeltas(deltas) {
  return deltas.reduce(
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

function scoreMetrics(delta) {
  return (
    scoreDelta(delta.branchingCount, 4) +
    scoreDelta(delta.maxIndentDepth, 4) +
    scoreDelta(delta.mutableLocalCount, 3) +
    scoreDelta(delta.specialCaseCount, 3) +
    scoreDelta(delta.tryCatchCount, 4) +
    scoreDelta(delta.localHelperCount, 2) +
    scoreDelta(delta.booleanOperatorCount, 1) +
    scoreDelta(delta.lines, 1) +
    scoreDelta(delta.returnCount, -1)
  );
}

function scoreDelta(delta, weight) {
  return delta === 0 ? 0 : delta < 0 ? Math.abs(delta) * weight : -delta * weight;
}
