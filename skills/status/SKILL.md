---
description: Show Priors status — mode, counts, last log, useful next action.
---

Run `node ${CLAUDE_PLUGIN_ROOT}/bin/priors.js status --project-root "${CLAUDE_PROJECT_DIR:-$PWD}"` and present the output. If there are no entries yet, suggest the user start with `/priors:log "<claim>"` or `/priors:rule-add "<rule>"`.
