---
description: Force-write one typed priors entry for the current work. User picks type, summary, and fields.
---

# /priors:log

Write a single typed entry to the priors store for something that just
happened in this session. Bypasses any threshold — if the user runs this,
they've decided the thing is logworthy.

## Store path

Resolve once at the start, via Bash:

```bash
slug="$(pwd | sed 's|/|-|g')"
store="$HOME/.claude/projects/$slug/priors"
```

All Read/Write paths below are relative to `$store`.

## When to use

- User explicitly runs `/priors:log`.
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
| `constraint` | A rule. Phase 1: create as `note` unless user explicitly promotes via future `/priors-promote`. |
| `pattern` | Proven approach worth remembering. Not a hard rule. |
| `decision` | Choice was made between alternatives. |
| `dead-end` | Approach was tried and failed. Distinct from `correction`. |
| `operator` | Update to `operator.yaml`. Not an individual entry — edit the rolling file. |
| `open-question` | Investigated, deferred. |

## Field collection

Read `internal/phase-1-spec.md` §3 (or `.claude/skills/priors/schemas/*.yaml`)
if you need full schemas. Minimum fields to collect before writing:

**Common:**
- `summary` (one line, what someone grepping the log would search for)
- `tags` (3–6; Read `$store/index.json` first for existing tags — prefer reuse over inventing)
- `why` for `correction` / `decision` / `dead-end` — do not write these types without a `why`
- `source.files` — REQUIRED for `correction`, `decision`, `pattern`,
  `dead-end` entries. List the actual file path(s) the entry touches.
  This is what makes entity/file-lookup recall work (e.g., "what's
  SidebarGroupLabelDemo?" resolves by `source.files` substring match).
  If an entry genuinely has no file anchor, push back on whether it's
  worth logging at all.

**Type-specific:** per the schemas in the spec. Don't fabricate — ask
the user if a required field isn't clear from context.

## Filename

```
$store/entries/<YYYY-MM-DD>-<HHMM>-<type>-<slug>.yaml
```

Get timestamp from `TZ=Australia/Perth date '+%Y-%m-%d-%H%M'` via Bash.
Do not guess. Slug: 2–5 words from the summary, kebab-case.

## Write sequence

1. Draft the entry in YAML per the schema.
2. Show the user the draft. Ask: write as-is, revise, or cancel?
3. On approval, Write the entry to `$store/entries/<filename>`.
4. Regenerate the index: run the `/priors:index` logic (Read every
   `$store/entries/*.yaml`, Write `$store/index.json`). Do not hand-edit
   the index.
5. Tell the user the entry ID and the tags it was filed under.

## Operator updates are different

If the user says "remember that I..." or describes a project-scoped
preference, that's an `operator.yaml` edit, NOT an entry. Workflow:

1. Read `$store/operator.yaml`.
2. Propose the diff to the user.
3. On approval, update `as_of:` to today and apply the change via Edit.
4. Do NOT create an entry in `entries/` for operator changes. The
   operator file IS the record.

## What NOT to do

- Do not write an entry without user approval unless it's a mandatory
  correction (user literally just corrected you).
- Do not invent tags. Read `index.json` first.
- Do not backdate entries. Timestamp from system clock, always.
- Do not write multiple entries in one invocation. If the session
  warrants that, tell the user to run `/priors:log` multiple times.
  (Phase 2 adds `/priors:distill` for batched proposals with per-entry
  approval.)
- Do not hand-edit `index.json` after writing. Run the index
  regeneration step.
