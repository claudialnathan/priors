#!/usr/bin/env bash
# SessionStart: load a compact orientation (mode + brief head) so the agent
# knows project context without paying for full-store retrieval up front.
#
# Bounded: only the head of the brief is emitted. Agents pull deeper context
# via /recall or /brief on demand.
set -euo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-${PWD}}"
PRIORS_BIN="${CLAUDE_PLUGIN_ROOT:-.}/bin/priors.js"

# Initialize on first run if needed; idempotent.
if [ ! -d "${PROJECT_ROOT}/.priors" ]; then
  node "${PRIORS_BIN}" init --project-root "${PROJECT_ROOT}" >/dev/null 2>&1 || true
fi

node "${PRIORS_BIN}" hook session-start --project-root "${PROJECT_ROOT}" 2>/dev/null || true
