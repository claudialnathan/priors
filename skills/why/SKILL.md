---
description: Explain which priors and rules influenced this session's responses.
---

Run `node ${CLAUDE_PLUGIN_ROOT}/bin/priors.js why --project-root "${CLAUDE_PROJECT_DIR:-$PWD}"` and present the result.

If the list is empty, say "no priors have been consulted in this session yet" and suggest running `/priors:recall <topic>` to bring some in. Do not fabricate consulted priors.
