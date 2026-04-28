---
description: Show the deterministic project brief — IDs and one-line summaries for active priors.
---

Run `node ${CLAUDE_PLUGIN_ROOT}/bin/priors.js brief --project-root "${CLAUDE_PROJECT_DIR:-$PWD}"` and present the output verbatim. The brief is bounded by token budget and assembled without an LLM, so it's safe to surface as-is.
