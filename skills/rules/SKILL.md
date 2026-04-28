---
description: List active rules. Optionally filter by area or priority.
argument-hint: [--area <name>] [--priority high|medium|low]
---

Run `node ${CLAUDE_PLUGIN_ROOT}/bin/priors.js rules $ARGUMENTS --project-root "${CLAUDE_PROJECT_DIR:-$PWD}"` and present the list.

For each rule show:

- `<readable-id>` (e.g. `R-002`) — `<priority>` — `<claim>`  
  area, author (user|agent), as_of date

If the list is empty, suggest `/priors:rule-add "<rule>"` to add one. Do not invent rules.
