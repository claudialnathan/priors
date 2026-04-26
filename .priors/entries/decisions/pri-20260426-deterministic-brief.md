---
id: pri-20260426-deterministic-brief
kind: decision
status: active
confidence: high
as_of: 2026-04-26
created_at: 2026-04-26T05:30:00Z
updated_at: 2026-04-26T05:30:00Z
claim: "priors://brief is mechanically assembled from indexes/all.json. No LLM call inside the assembler."
relations:
  supersedes: []
  contradicts: []
  reinforces: []
  derived_from: []
tags:
  - brief
  - determinism
  - resource
---

## Why

The brief is the highest-leverage interaction in Priors — every fresh agent reads it first. If it is wrong, no other surface matters because nothing under it will be trusted. Determinism is the only credible defense against the "compression chooses wrong" failure mode that consumer memory products suffer from.

The spec at `docs/specs/brief-resource.md` enforces a hard 2,000-token ceiling, per-section budgets, and a fixed nine-section structure. Two runs against the same store must produce byte-identical output. A model post-formatter is allowed only for tone, not for content.

## Implications

- Snapshot tests in `tests/snapshots/brief/` enforce byte-identical output.
- Token counting uses a conservative character-based approximation (`ceil(chars / 4)` for English) to stay dependency-free.
- Empty stores still render the full nine-section skeleton with placeholders. The brief is always a useful interface, even on a fresh project.

## Out of scope

- Model-generated "weather" assessments at the top of the brief. Appealing but violates determinism.
