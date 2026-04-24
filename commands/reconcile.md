---
description: Re-run inference against the repo and surface drift from the HEAD.md that /priors:init wrote. Phase 2 — not yet implemented.
---

# /priors:reconcile

**Status: not yet implemented.** Documented here so the contract is discoverable.

## What this will do (Phase 2)

`/priors:init` stores an `inferred_signals_hash` in `state.json` — a SHA256 of the canonical inference inputs (package.json + tsconfig.json + lockfile names + CI workflow contents + committer count). That hash is the drift-detection primitive.

`/priors:reconcile` re-runs `lib/init/inferred-signals-hash.sh` against the current tree, compares the result to the stored hash, and — on mismatch — re-runs the rest of the inference helpers and emits a diff:

- Which facts in `HEAD.md` are now stale.
- Which facts appear that weren't present at init.
- Which back-pressure targets have been added, moved, or removed.

The diff is proposed as candidate `contradiction` entries (for facts that flipped) and candidate `note` or `constraint` updates (for additions). Nothing is auto-applied — it emits as a reviewable list, same discipline as `/priors:distill`.

## Why it exists

`HEAD.md` is always frozen at init time unless something re-runs inference. Without `/priors:reconcile`, the `HEAD.md` written in month 1 silently decays into a false-user-belief record by month 6 — precisely the AI Index 2026 failure mode this tool exists to avoid.

The hash in `state.json` makes "is HEAD.md still accurate?" a first-class, queryable signal instead of an implicit one.

## Why this isn't Phase 1

Phase 1 is capture + retrieve. Drift reconciliation depends on the curation layer (`/priors:distill`, `/priors:promote`, contradiction objects as first-class entries) that Phase 2 ships. Landing reconcile first would produce candidate entries with no place to live.

## Interim

If you suspect `HEAD.md` has drifted, edit it directly. Update the `as_of` line at the top. The loss is that `inferred_signals_hash` in `state.json` now disagrees with the repo without any record of why — which is exactly what the reconcile command will fix when Phase 2 lands.

See `docs/onboarding-design.md` § Reconcile for the full design.
