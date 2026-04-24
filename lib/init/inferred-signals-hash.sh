#!/usr/bin/env bash
# inferred-signals-hash.sh — deterministic sha256 of the inference inputs
# that drive HEAD.md / operator.yaml content.
#
# Stored in state.json.inferred_signals_hash at init. A future
# /priors:reconcile re-runs inference and compares hashes: a mismatch
# means the repo has drifted past what HEAD.md claims, and the reconcile
# flow surfaces the diff as candidate contradiction entries.
#
# Output: a single line "inferred_signals_hash=sha256-<hex>".

set -uo pipefail

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

{
  # Full contents of shape-defining files.
  for f in package.json tsconfig.json pnpm-workspace.yaml turbo.json nx.json; do
    if [[ -f "$f" ]]; then
      printf '== %s ==\n' "$f"
      cat "$f"
      printf '\n'
    fi
  done

  # Lockfile NAME only — contents churn too much to be drift-meaningful.
  for f in pnpm-lock.yaml yarn.lock bun.lockb bun.lock package-lock.json; do
    if [[ -f "$f" ]]; then
      printf 'lockfile=%s\n' "$f"
    fi
  done

  # CI workflows, sorted for determinism.
  if [[ -d .github/workflows ]]; then
    while IFS= read -r wf; do
      printf '== %s ==\n' "$wf"
      cat "$wf"
      printf '\n'
    done < <(find .github/workflows -type f \( -name '*.yml' -o -name '*.yaml' \) 2>/dev/null | LC_ALL=C sort)
  fi

  # Committer count — one number, no names. Proxy for team shape.
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    cc=$(git shortlog -s -n --no-merges 2>/dev/null | wc -l | tr -d ' ')
    printf 'committers=%s\n' "$cc"
  fi
} > "$tmp"

if command -v shasum >/dev/null 2>&1; then
  h=$(shasum -a 256 "$tmp" | awk '{print $1}')
elif command -v sha256sum >/dev/null 2>&1; then
  h=$(sha256sum "$tmp" | awk '{print $1}')
else
  h="unavailable"
fi

echo "inferred_signals_hash=sha256-$h"
exit 0
