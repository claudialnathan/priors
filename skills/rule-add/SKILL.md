---
description: Add a user-authored rule. High-priority by default. Direct write — no quote-or-refuse.
argument-hint: <rule text>
---

The user wants to add a rule: $ARGUMENTS

Pick an area if obvious from the text. The conventional areas are: `coding`, `research`, `product`, `agent-conduct`, `project-management`, `handover`. If unsure, omit `--area`.

Run:

```
node ${CLAUDE_PLUGIN_ROOT}/bin/priors.js rule add "$ARGUMENTS" \
  --project-root "${CLAUDE_PROJECT_DIR:-$PWD}" \
  --priority high
```

Present the readable id (e.g. `R-002`) and the rule text. Confirm to the user that the rule is now active and will be applied in future agent recommendations.
