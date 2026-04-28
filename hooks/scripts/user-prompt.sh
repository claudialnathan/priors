#!/usr/bin/env bash
# UserPromptSubmit: detect explicit "log this" / "this is a rule" intent in
# the user prompt. On match, emit a one-liner so the agent surfaces the
# /log or /rule add path. Bounded — never reads beyond the prompt body.
set -euo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-${PWD}}"
PRIORS_BIN="${CLAUDE_PLUGIN_ROOT:-.}/bin/priors.js"

# Read prompt from stdin (Claude Code passes the user prompt JSON on stdin).
input="$(cat || true)"
prompt="$(printf '%s' "${input}" | node -e '
let s = "";
process.stdin.on("data", c => s += c);
process.stdin.on("end", () => {
  try { const j = JSON.parse(s); process.stdout.write(j.prompt ?? j.text ?? ""); }
  catch { process.stdout.write(s); }
});
' 2>/dev/null || printf '%s' "${input}")"

if [ -z "${prompt}" ]; then exit 0; fi

tmp="$(mktemp)"
trap 'rm -f "${tmp}"' EXIT
printf '%s' "${prompt}" > "${tmp}"

node "${PRIORS_BIN}" hook user-prompt --project-root "${PROJECT_ROOT}" --text "@${tmp}" 2>/dev/null || true
