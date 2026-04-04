#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(pwd)"
PROMPT_FILE="$ROOT_DIR/research/program.md"
ITERATIONS="${1:-}"
STOP_ON_FAILURE="${STOP_ON_FAILURE:-1}"

if [[ ! -f "$PROMPT_FILE" ]]; then
  printf 'Missing prompt file: %s\n' "$PROMPT_FILE" >&2
  exit 1
fi

count=0

while :; do
  if [[ -n "$ITERATIONS" && "$count" -ge "$ITERATIONS" ]]; then
    break
  fi

  count=$((count + 1))
  printf '\n[%s] Starting research pass %d\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$count"

  prompt="$(<"$PROMPT_FILE")"

  if ! opencode run "$prompt" --model openai/gpt-5.4; then
    printf '[%s] Research pass %d failed\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$count" >&2
    if [[ "$STOP_ON_FAILURE" == "1" ]]; then
      exit 1
    fi
  fi
done

printf '\nCompleted %d research pass(es)\n' "$count"
