---
id: pri-20260426-decay-and-emit-overreach
kind: failure
status: active
confidence: high
as_of: 2026-04-26
created_at: 2026-04-26T05:30:00Z
updated_at: 2026-04-26T05:30:00Z
claim: "v0.3 added active decay scoring, helpful/harmful counters, and emit_constraint. All three were rejected in v1 because curation, not retrieval gymnastics, is the product."
relations:
  supersedes: []
  contradicts: []
  reinforces: []
  derived_from: []
tags:
  - architecture
  - v0.3
  - retrieval
---

## What was tried

The v0.3 implementation (preserved at `git checkout legacy/v0.3.0`) shipped:

- `activation_score` and `decayed_activation_score` per entry, with a `decay_half_life_days` field.
- `helpful_count` / `harmful_count` reinforcement counters via a `priors.reinforce` tool.
- `emit_constraint` + `applyEmission` to write executable artifacts (`.git/hooks/priors/*`, `scripts/priors/*`) gated by an env-var token.
- `priors://orientation/head`, `priors://operator`, `priors://state`, `priors://compiled/harness-reminders` resources.

## Why it failed

1. **Decay scoring solved the wrong problem.** The hard product question is what to keep and what to promote, not how to weight retrieval scores. Decay added bookkeeping with no measurable improvement in agent behavior at the entry counts v1 targets (≤1,000).
2. **Reinforcement counters created a feedback loop.** Agents that recall an entry tend to reinforce it whether or not it actually helped, because "I just used this" is correlated with "this seems relevant" but not with "this was correct." Counters drifted upward without curation signal.
3. **emit_constraint blurred the trust boundary.** Generating executable hooks/scripts from model output — even gated by a token — gave the surface a much higher blast radius than the rest of Priors. It also required an allowlist that grew with every new artifact kind, becoming its own maintenance burden.
4. **The orientation surface fragmented.** Four separate orientation resources meant agents had to know which to read first. v1 collapses this to a single deterministic `priors://brief`.

## Correction

v1 deletes all four. Decay is replaced by `as_of` dates and explicit `mark_stale`. Helpfulness signal comes from explicit user `commit_learning` and `mark_stale` actions. Constraint emission is deferred to v2 and will require its own spec doc. The single orientation surface is `priors://brief`.

## Should this become a test, linter, policy, or memory entry?

This entry is the policy. The `.cursorrules` "What is OUT in v1" list and `AGENTS.md` § "What never to do" enforce it. A regression test (`tests/regression/emit-deferred.test.ts`) asserts `emit_constraint` returns "not in v1".
