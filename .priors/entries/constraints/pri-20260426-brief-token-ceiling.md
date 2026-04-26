---
id: pri-20260426-brief-token-ceiling
kind: constraint
status: active
confidence: high
as_of: 2026-04-26
created_at: 2026-04-26T05:30:00Z
updated_at: 2026-04-26T05:30:00Z
claim: "priors://brief must fit within ~2,000 tokens, enforced per-section per the budget table in docs/specs/brief-resource.md. There is no extended brief."
relations:
  supersedes: []
  contradicts: []
  reinforces:
    - pri-20260426-deterministic-brief
  derived_from: []
tags:
  - brief
  - performance
  - resource
---

## Why

The brief is the orientation surface. It must be cheap to read, fast to fit in any agent's context budget, and predictable across stores. A larger or unbounded brief erodes its job: agents would skip it or summarize it, defeating the determinism guarantee.

## How it is enforced

- Per-section token budgets in `docs/specs/brief-resource.md` § Token budget.
- On overflow, items are dropped per the spec's overflow policy. The brief never globally re-truncates — it always preserves structure.
- Snapshot tests in `tests/snapshots/brief/` enforce both byte-identical output and the 2,000-token ceiling on representative store states.
- Token counting uses `ceil(chars / 4)` for English. This is conservative; it overcounts slightly, which biases toward staying under budget.
