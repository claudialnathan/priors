---
description: Force-write one typed playbook entry for the current work. User picks type, summary, and fields.
---

# /playbook-log

Write a single typed entry to `/memories/playbook/entries/` for something
that just happened in this session. Bypasses any threshold — if the user
runs this, they've decided the thing is logworthy.

## When to use

- User explicitly runs `/playbook-log`.
- You just took a correction from the user and should log it. In this
  case, don't wait for the command — prepare the entry, then tell the
  user you're about to log and write it. Corrections are mandatory.
- Something tangible shipped (feature, refactor, meaningful fix) and
  the `why` is non-obvious. Ask the user first — don't spam the store.

## Entry type decision

Ask the user (or decide from context) which of the seven types applies.
One entry per command; if two types fit, pick the stronger one and note
the other in the entry body.

| Type | When |
|---|---|
| `correction` | Agent did something wrong; user corrected. |
| `constraint` | A rule. Phase 1: create as `note` unless user explicitly promotes via future `/playbook-promote`. |
| `pattern` | Proven approach worth remembering. Not a hard rule. |
| `decision` | Choice was made between alternatives. |
| `dead-end` | Approach was tried and failed. Distinct from `correction`. |
| `operator` | Update to `operator.yaml`. Not an individual entry — edit the rolling file. |
| `open-question` | Investigated, deferred. |

## Field collection

Read `phase-1-spec.md` §3 if you need full schemas. Minimum fields to
collect before writing:

**Common:**
- `summary` (one line, what someone grepping the log would search for)
- `tags` (3–6; check `index.json` first for existing tags — prefer reuse over inventing)
- `why` for `correction` / `decision` / `dead-end` — do not write these types without a `why`

**Type-specific:** per the schemas in the spec. Don't fabricate — ask
the user if a required field isn't clear from context.

## Filename

```
entries/<YYYY-MM-DD>-<HHMM>-<type>-<slug>.yaml
```

Get timestamp from `TZ=Australia/Perth date '+%Y-%m-%d-%H%M'` — do not
guess. Slug: 2–5 words from the summary, kebab-case.

## Write sequence

1. Draft the entry in YAML per the schema.
2. Show the user the draft. Ask: write as-is, revise, or cancel?
3. On approval, `memory.create /memories/playbook/entries/<filename>`
   with the full entry.
4. Regenerate the index: invoke `/playbook-index` logic (read entries,
   rewrite index.json). Do not hand-edit the index.
5. Tell the user the entry ID and the tags it was filed under.

## Operator updates are different

If the user says "remember that I..." or describes a project-scoped
preference, that's an `operator.yaml` edit, NOT an entry. Workflow:

1. `memory.view /memories/playbook/operator.yaml`.
2. Propose the diff to the user.
3. On approval, update `as_of:` to today and apply the change via
   `memory.str_replace`.
4. Do NOT create an entry in `entries/` for operator changes. The
   operator file IS the record.

## What NOT to do

- Do not write an entry without user approval unless it's a mandatory
  correction (user literally just corrected you).
- Do not invent tags. Check `index.json` first.
- Do not backdate entries. Timestamp from system clock, always.
- Do not write multiple entries in one invocation. If the session
  warrants that, use `/playbook-distill` instead (Phase 2 — for now,
  tell the user to run this command multiple times).
- Do not hand-edit `index.json` after writing. Run the index
  regeneration step.
