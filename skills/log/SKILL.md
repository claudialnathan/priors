---
description: Force-log a memory entry from the current context.
argument-hint: <claim text>
---

The user wants to log: $ARGUMENTS

Before writing, do this:

1. **Translate, do not copy.** If $ARGUMENTS reads like raw user voice ("ugh, this thing is annoying"), rewrite the claim in neutral, durable form (e.g. "X is unreliable when Y; prefer Z"). Preserve the original phrase as evidence in the rationale.
2. **Pick a kind.** decision | failure | constraint | pattern | question | rule. Default to `decision` if unsure.
3. **Confirm with the user only if the rewrite changes meaning.** Otherwise just log.

Then run:

```
node ${CLAUDE_PLUGIN_ROOT}/bin/priors.js log "<neutral claim>" \
  --project-root "${CLAUDE_PROJECT_DIR:-$PWD}" \
  --kind <kind> \
  --user-text "$ARGUMENTS" \
  --rationale "<one-sentence why>"
```

Present the result with the readable id (e.g. `D-007`) and the final claim.
