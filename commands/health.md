---
description: Audit the priors store — surface stale, low-use, contradicted, and duplicate-candidate entries. Pull-based; never ambient.
---

# /priors:health

A deliberate, user-invoked observability command. Walks the store and surfaces
entries that want attention. Complements `/priors:distill` (Phase 2, which
*grows* the store from transcripts) — health *audits* what's already there.

**Pull-based, never ambient.** Running this is an explicit user action.
Consistent with the "zero ambient cost by default" principle.

## Store path

```bash
slug="$(pwd | sed 's|/|-|g')"
store="$HOME/.claude/projects/$slug/priors"
```

## What it does

1. Read `$store/index.json` (cheap — headers only).
2. For each active entry, check four health axes:
   - **Stale** — `valid_through` is set and in the past (the entry has an
     expiration date that has already passed).
   - **Low-use** — `helpful_count == 0` and `contradicted_count == 0`, AND
     the entry is older than 30 days. Never-cited, never-contradicted, aging.
   - **Needs review** — `contradicted_count > 0` but `status: active`. The
     entry has been contradicted but wasn't resolved.
   - **Duplicate candidate** — entry shares >= 2 tags with another active
     entry AND has a summary with high lexical overlap (>= 60% of the
     shorter summary's tokens). Two entries saying similar things in
     similar areas.
3. Emit a human-readable report grouped by axis, with entry id, type,
   summary, and recommendation per finding.
4. Do NOT modify the store. Surfacing is the whole job — the user decides
   what to do.

## Report format

```
Priors health — $store

Stale (valid_through passed):
  - 2025-11-03-1200-pattern-old-bundler — "Use webpack 4 for this project"
    valid_through: 2026-01-01  (113 days past)
    Recommendation: archive or supersede with a fresh pattern entry.

Low-use (>30 days, never cited):
  - 2026-02-12-0930-constraint-legacy-api-version — "Pin to v1 of legacy API"
    Recommendation: has this constraint been enforced? If it's still
    relevant, run /priors:recall with its tags to see whether retrieval
    is surfacing it at all.

Needs review (contradicted but active):
  - 2026-03-15-1430-decision-state-management — "Use Redux for app state"
    contradicted_count: 2
    Recommendation: read the contradicting entries (supersedes graph)
    and either supersede this one or mark it archived.

Duplicate candidates:
  - 2026-04-01-1000-pattern-zod-validation  (tags: validation, forms)
    2026-04-10-1400-pattern-zod-forms       (tags: validation, forms)
    summary overlap: 67%
    Recommendation: if one supersedes the other, set supersedes /
    superseded_by. If they're genuinely different, differentiate their
    summaries.

Summary: 4 findings across 3 axes. Nothing urgent.
```

If the store is healthy, report `No findings — store looks clean.`

## What NOT to do

- Do not auto-apply fixes. This is a surface-and-recommend command. Any
  archival, supersession, or merge is a separate user action (Phase 2 will
  add `/priors-promote` and `/priors-supersede` for these).
- Do not emit JSON by default — the human-readable report is the output.
  If a future tool wants machine-parseable output, add a `--json` flag.
- Do not load full entry bodies unless a specific axis requires it (the
  duplicate check needs summaries; the rest work from `index.json` alone).
  Token economy matters even for user-invoked commands.

## Low-use threshold rationale

30 days is a working default, not a proven cutoff. Too-aggressive
low-use flagging will surface entries that are simply in a dormant
part of the codebase — a constraint on payment-processing code doesn't
get cited for weeks if no one's touching payments, and that doesn't
make it stale.

Treat findings as prompts for human review, not verdicts. Adjust the
threshold if real usage shows it's noisy.
