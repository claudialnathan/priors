---
description: (Phase 2 — stubbed) Sub-agent reviews the session transcript and proposes typed entries for the user to approve.
---

# /priors-distill

**Phase 2 command. Stubbed in Phase 1.**

The intended behavior: spawn a sub-agent that reads the session transcript,
identifies loggable moments (corrections, decisions, dead-ends, patterns),
and proposes typed entries as a reviewable diff. The user approves or
rejects per-entry; approved entries get written and the index regenerated.

## Phase 1 behavior

Do not attempt the full distill flow in Phase 1. Instead:

1. Tell the user: "Distill is Phase 2 — not yet implemented."
2. Offer the Phase 1 workaround: walk the user back through the session
   (no sub-agent), identify 1–3 loggable moments out loud, and propose
   running `/priors-log` for each. User confirms one at a time.
3. Do not batch-write entries. Do not auto-approve. Each entry is an
   explicit `/priors-log` invocation with user sign-off.

## Why this is Phase 2

The distill sub-agent is where curation starts being the product. It
needs:

- Helpful/contradicted counter logic
- Conflict detection (new entry vs existing)
- Promotion path (raw → structured → constraint)
- Back-pressure gate on constraint promotion (enforcement target required)

None of that is in Phase 1. Shipping a half-distill risks filling the
store with low-quality entries that we then have to prune. Not worth it.

## What NOT to do in Phase 1

- Do not silently write multiple entries.
- Do not fake the distill flow by chaining `/priors-log` invocations
  without user approval per entry.
- Do not mark this command as "working" in docs or in the skill's command
  list beyond the stub. The spec and the skill both reference it as
  Phase 2 — keep it honest.
