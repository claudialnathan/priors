---
id: pri-20260426-contested-resolution-ux
kind: question
status: active
confidence: medium
as_of: 2026-04-26
created_at: 2026-04-26T05:30:00Z
updated_at: 2026-04-26T05:30:00Z
claim: "What is the right CLI/MCP UX for resolving contested entries? A `priors resolve <id>` verb, a `commit_learning` flag, or just manual `mark_stale` + `link_entries`?"
relations:
  supersedes: []
  contradicts: []
  reinforces: []
  derived_from: []
tags:
  - cli
  - curation
  - ux
---

## What's known

- `link_entries(a, contradicts, b)` sets both `a` and `b` to `status: contested`.
- `recall(status: contested)` and the brief surface contested pairs together.
- The user is the only resolver; nothing auto-resolves.

## Options

- **A. Manual primitives only.** The user resolves via `mark_stale` on the losing side and (optionally) `link_entries(loser, supersedes, winner)`. No new verb. Smallest surface.
- **B. `priors resolve <pair>` verb.** A guided CLI flow: shows both claims, prompts for which wins, applies the right primitives. Better UX, more code, more surface to keep stable.
- **C. `commit_learning(staged_id, --resolves <pair>)` flag.** When the staged entry is itself the resolution. Specific to one workflow.

## Resolution path

Pick A for v1. Ship the brief's "Contested or under review" section and let users learn the primitives. Revisit option B if `priors evals` shows users routinely failing at the manual flow.
