---
id: pri-20260426-stage-only-distillation
kind: decision
status: active
confidence: high
as_of: 2026-04-26
created_at: 2026-04-26T05:30:00Z
updated_at: 2026-04-26T05:30:00Z
claim: "Distillation never auto-commits. stage_learning only writes to staged/; commit_learning is the only path to active entries/, and it requires an explicit user action."
relations:
  supersedes: []
  contradicts: []
  reinforces: []
  derived_from: []
tags:
  - distillation
  - safety
  - curation
---

## Why

The cost asymmetry is large. A false negative (failing to stage a real lesson) is recoverable — the user can stage it manually next time. A false positive (committing a fabricated rule with confidence) silently misdirects every future agent until someone notices.

Single-pass LLM extraction has hallucination rates of 15–88% depending on domain. Verification-in-the-loop pipelines bring this under 2%, but only with a deterministic verification step. Even with verification, "stage and let the user approve" is the cheapest insurance.

## Implications

- Hooks may stage; hooks may not commit. There is no auto-commit anywhere, ever.
- Every staged candidate pays the verification cost. There is no fast path.
- The verification step is implemented in code (substring match), not in prompt instructions. See `docs/specs/staged-distillation.md` § Verification step.
- Forbidden kinds (user preference, identity, psychology) are dropped at verification, not just discouraged in the prompt.

## Risks

- Users may grow impatient with the staged pile. Mitigation: if more than 20 staged entries are over 30 days old, the brief mentions it; over 50, the CLI suggests `priors review-staged`.
