---
name: priors
description: >
  Manage the project-scoped priors store — a typed trajectory dataset of
  corrections, constraints, patterns, decisions, dead-ends, operator
  context, and open questions. Use at session start to orient via
  HEAD.md + operator.yaml. Use during work to recall relevant entries.
  Use when writing new entries per the schema. Triggered by any
  /priors-* command and by "why did we", "what did we decide", "what
  not to try", "cold-start context" questions. If the priors store
  exists in this project, this skill applies automatically.
---

# Priors

Project-scoped harness memory. A typed trajectory dataset of the decisions,
corrections, constraints, and dead-ends that shape how this project is
built. A Claude Code plugin — uses native Read / Write / Edit / Bash on
a directory tree; no SDK memory tool required.

**Positioning:** "the harness is the dataset." The priors is not a notes
app. Every decision here is judged by whether it makes the harness more
differentiated for this specific project.

**Primary use case:** handoff artifact across context resets. Entries must
be self-contained enough that a cold-start agent becomes productive by
reading the priors only — not by replaying prior conversation history.

## Store location

Project-scoped, outside the repo tree. Resolve the path at the start of
any command via Bash:

```bash
slug="$(pwd | sed 's|/|-|g')"
store="$HOME/.claude/projects/$slug/priors"
```

This co-locates with Claude Code's own per-project data (session logs,
auto-memory) under `~/.claude/projects/<slug>/`. `git status` in the
repo stays clean — nothing priors-related lands in the working tree.

## File layout (under `$store/`)

```
HEAD.md              # orientation — always Read first
index.json           # machine index of all active entries
operator.yaml        # rolling single-file doc of user-in-project context
state.json           # live harness pointers (branch, feature, open PRs)
entries/
  <date>-<HHMM>-<type>-<slug>.yaml
compiled/
  harness-reminders.md   # derived, hook-injected (Phase 3)
  narrative.md           # derived, human-readable (Phase 3)
archive/
  <retired entries>
```

Full schema lives in `internal/phase-1-spec.md` §3 and in
`.claude/skills/priors/schemas/*.yaml`. This file is the operational
summary; consult the spec when field questions come up.

## Cold-start protocol

On session start, the `SessionStart` hook should have already surfaced the
priors. Do this yourself if it didn't:

1. Read `$store/HEAD.md` — the orientation file. Tells you how to
   navigate. Short by design.
2. Read `$store/operator.yaml` — who the user is, in the context of this
   project.
3. Read `$store/state.json` — current branch, active feature,
   known-broken list.

**Do not read `$store/entries/` unprompted.** That's the long tail; load
it on demand only.

If any of those three files don't exist, tell the user to run
`/priors:init` before proceeding.

## During work — retrieval

When a topic is in play ("why did we…", "what did we decide about…", "what
not to try"), reach for the index first, not the full entry set:

1. Read `$store/index.json` — grep-friendly JSON.
2. Filter by tag, type, or substring to find candidate entry IDs.
3. Read only those matched entries under `$store/entries/`.

Retrieval-on-demand is the design. Loading every entry on every session
defeats the point and creates context rot.

## Writing entries

Entries are typed. Seven types in Phase 1:

| Type | Use when |
|---|---|
| `correction` | Agent did something wrong; user corrected. Record symptom, wrong approach, correct approach, why. |
| `constraint` | A rule that should be enforced. Requires an `enforcement:` target (back-pressure gate). |
| `pattern` | Proven approach with rationale. Not a hard rule. Include counter-examples. |
| `decision` | Choice made. Preserve alternatives considered and why rejected. Include `revisit_if`. |
| `dead-end` | Approach was tried, didn't work. Distinct from correction — this is about pruning search space. |
| `operator` | Project-scoped facts about the user. Lives in `operator.yaml`, not individual entries. |
| `open-question` | Investigated but deferred. Record `why_deferred` and `watch_for`. |

All entries share common fields: `id`, `type`, `created`, `valid_from`,
`valid_through`, `tags`, `source`, `confidence`, `helpful_count`,
`contradicted_count`, `status`, `summary`. See spec §3.1 for details.

**Filename convention:** `entries/<YYYY-MM-DD>-<HHMM>-<type>-<slug>.yaml`.
Get timestamps from `TZ=Australia/Perth date '+%Y-%m-%d-%H%M'` — do not
guess.

**After writing any entry:** regenerate `index.json` via `/priors:index`
(or equivalent command). Never hand-edit the index.

## Epistemic framing — critical

Every entry has `valid_from` and `valid_through`. Retrieval treats entries
as **"as of" records**, not timeless beliefs.

When surfacing an entry to reasoning, frame it that way: "as of 2026-04-22,
on this project, the operator said X." Do NOT inject stored preferences
as present-tense user beliefs. Stanford AI Index 2026 documented that
false-user-belief framing collapses model accuracy (DeepSeek R1: 90%+ →
14.4%). Treat this as a design constraint, not a footnote.

## operator.yaml protocol

Single rolling file, NOT individual entries. Project-scoped.

- Read at session start via the `SessionStart` hook path above.
- **At init time, operator.yaml is deliberately sparse.** `/priors:init`
  writes only: `as_of`, optional `role_in_project` (only if volunteered),
  `known_back_pressure_targets` (from detected lint/hook/CI paths),
  optional `notes[]` of verbatim user quotes with `as_of` and `from`.
  It does NOT write `how_they_think`, `preferences`, `strengths`,
  `growth_edges`, or `goals_for_this_project` — those are paraphrased
  attributes that re-introduce the belief-as-user-framing vulnerability
  (AI Index 2026: DeepSeek R1 accuracy 90%+ → 14.4% under that framing).
  The schema permits the fields so users who explicitly volunteer them
  later can add them, but init never populates them.
- **Ambient per-prompt injection is opt-in** — disabled by default. Users
  who want persistent reinforcement run `/priors:auto-on` to register the
  `UserPromptSubmit` hook (+~200 tokens per prompt). `/priors:auto-off`
  reverts. The default is zero ambient cost; operator context reaches
  the agent via the cold-start read only.
- Updated by the user (directly via Edit, or via `/priors:log` with type
  operator).
- Carries an `as_of:` date. When a field changes, update `as_of` — don't
  lose the old value silently (append under a `superseded_fields:` list
  if it matters).
- When volunteered free-text arrives (user says "I tend to think of X as
  Y"), prefer appending to `notes:` as a direct quote with `as_of` and
  `from:` fields rather than paraphrasing into `how_they_think`.

## What NOT to do

- Do not dump the full `entries/` directory into context on load. Use
  `index.json` + targeted reads.
- Do not hand-edit `index.json` or compiled outputs. Regenerate via
  commands.
- Do not write a `correction` entry without a `why` field. The rationale
  is the whole point — descriptive-only entries rot.
- Do not promote an entry to `constraint` without an `enforcement:` target
  (Phase 2 gate; even in Phase 1, don't write constraints that are pure
  description — tag them as `note` or leave them as `pattern`).
- Do not treat stored operator preferences as present-tense beliefs when
  reasoning. Re-frame as "as of [date], the operator said X".
- Do not rewrite existing entries to "update" them. Contradictions are
  first-class: write a new entry and let Phase 2 curation resolve the
  conflict explicitly.

## Phase 1 scope note

In Phase 1, the tool captures and retrieves. It does NOT yet:

- Auto-distill session transcripts (Phase 2).
- Enforce constraints via pre-tool-use hooks (Phase 4).
- Compile a human-readable narrative (Phase 3).
- Auto-apply harness artifacts (Phase 3+, and never without diff review).

If a user request points at a Phase 2+ feature, tell them which phase it
belongs to and offer the Phase 1 workaround (usually: manual entry via
`/priors:log`).

## Commands

| Command | Purpose |
|---|---|
| `/priors:init` | Bootstrap the priors store for this project. First E2E surface. |
| `/priors:log` | Write one typed entry for current work. |
| `/priors:state` | Update `state.json` from the current working tree. |
| `/priors:index` | Regenerate `index.json` from `entries/`. Idempotent. |
| `/priors:recall <query>` | Search by tag / type / substring / file path. |
| `/priors:health` | Audit the store for stale, low-use, contradicted, duplicate entries. |
| `/priors:auto-on` | Enable ambient per-prompt operator injection (opt-in). |
| `/priors:auto-off` | Disable ambient per-prompt operator injection. |
| `/priors:distill` | (Phase 2, stubbed) Sub-agent proposes entries from session transcript. |
| `/priors:reconcile` | (Phase 2, stubbed) Re-run inference, compare `inferred_signals_hash`, surface drift. |

Each command has a full instruction file under `.claude/commands/`. Read
the relevant one before executing — don't guess at argument shapes.
