---
description: Drift / appeasement / freshness check — flag priors that may need review.
---

Run `node ${CLAUDE_PLUGIN_ROOT}/bin/priors.js reflect --project-root "${CLAUDE_PROJECT_DIR:-$PWD}"` and present the flags.

If there are no flags, say so plainly.

If there are flags, group them by kind (`appeasement`, `repeated_rejection`, `user_emotion_as_fact`, `stale_freshness`, `ignored_high_priority_rule`, `broad_one_off_rule`, `overstated_confidence`) and recommend a remediation for each:

- `stale_freshness` → `/recall <topic>` and verify with current docs before relying on the prior.
- `user_emotion_as_fact` → consider rewriting the claim in neutral voice via `/log` and marking the original stale.
- `overstated_confidence` → consider lowering the confidence label or moving the entry to the review queue.
- `broad_one_off_rule` → consider narrowing the rule's scope.

Do not auto-edit anything; the user decides.
