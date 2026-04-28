---
description: Export Priors as a portable Markdown or JSON snapshot.
argument-hint: [md|json]
---

If $ARGUMENTS contains "json", emit machine-readable form:

```
node ${CLAUDE_PLUGIN_ROOT}/bin/priors.js index --project-root "${CLAUDE_PROJECT_DIR:-$PWD}"
```

Otherwise emit a human-readable Markdown handover. Run:

```
node ${CLAUDE_PLUGIN_ROOT}/bin/priors.js export --destination .priors/exports/handover-$(date +%Y%m%d) --project-root "${CLAUDE_PROJECT_DIR:-$PWD}"
node ${CLAUDE_PLUGIN_ROOT}/bin/priors.js brief --project-root "${CLAUDE_PROJECT_DIR:-$PWD}"
```

Present the brief output as the readable snapshot, then mention the export pack location for the full pack.
