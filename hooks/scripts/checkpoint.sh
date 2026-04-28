#!/usr/bin/env bash
# PreCompact / Stop / SessionEnd: emit a checkpoint marker.
#
# Bounded — no significance scan happens here. The companion skill
# `priors-steward` runs the gate when the agent pauses. This script just
# records that a checkpoint fired so /impact can show it.
set -euo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-${PWD}}"
PRIORS_BIN="${CLAUDE_PLUGIN_ROOT:-.}/bin/priors.js"
EVENT="${1:-stop}"

node "${PRIORS_BIN}" hook "${EVENT}" --project-root "${PROJECT_ROOT}" 2>/dev/null || true
