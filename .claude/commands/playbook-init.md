---
description: Bootstrap the /memories/playbook/ store for this project — scaffold files, interview for operator.yaml, write HEAD.md.
---

# /playbook-init

Bootstrap the playbook for this project. First end-to-end surface.

## When to use

- No `/memories/playbook/HEAD.md` exists yet for this project.
- User explicitly runs `/playbook-init`.
- User asks to "set up playbook" / "start a playbook" / similar.

## Preflight

Before writing anything, check:

1. `memory.view /memories/playbook/` — does the directory exist?
2. If it does, and `HEAD.md` is present, ask the user: overwrite, or abort?
   Default to abort. Do not silently overwrite existing playbook content.
3. If the directory doesn't exist, proceed.

## Step 1 — Scaffold the directory tree

Create empty placeholders via `memory.create` for:

- `/memories/playbook/HEAD.md` (content in step 3)
- `/memories/playbook/index.json` — start as `{"updated": "<now>", "entries": [], "tags": {}}`
- `/memories/playbook/state.json` — start as `{"updated": "<now>", "active_branch": null, "last_known_good_commit": null, "active_feature": null, "open_prs": [], "known_broken": []}`
- `/memories/playbook/entries/.keep` — empty file to hold the directory
- `/memories/playbook/compiled/.keep`
- `/memories/playbook/archive/.keep`

Get `<now>` from `TZ=Australia/Perth date -Iseconds`. Do not guess timestamps.

## Step 2 — Operator interview

Interview the user for `operator.yaml`. Ask 5–7 questions conversationally.
Don't make them fill a template. Examples of things to surface:

- What's their role on this project? (sole maintainer / contributor / reviewer / something else)
- What does success look like for them on this project?
- What's their background — what mental models do they bring?
- How do they want responses tuned? (terse vs detailed, jargon-level, etc.)
- What's frustrated them about AI assistants in the past on projects like this?
- Any specific preferences / refusals / idioms for this project?

Stop interviewing when you have enough to write a useful `operator.yaml`.
Do not force 7 questions if 4 gave you what you need.

Write the file. Schema:

```yaml
as_of: <today>
role_in_project: <short description>
how_they_think:
  - <bullet>
  - <bullet>
preferences:
  - <bullet>
  - <bullet>
strengths: [<tag>, <tag>]
growth_edges: [<tag>]
goals_for_this_project:
  - <bullet>
epistemic_note: >
  These are facts about how the operator works on THIS project as of
  the date above. They are not timeless truths. Treat as "as of <date>" —
  do not inject as present-tense beliefs.
```

## Step 3 — Write HEAD.md

Template (substitute `<project name>` from the current repo):

```markdown
# Playbook — <project name>

Harness memory for this project. Read this file first. Do not dump the full
entries directory into context.

## What this is

Typed records of decisions, corrections, constraints, and dead-ends from
prior sessions on this project. The *why* that commits can't carry. Plus
operator context (the person working on this project).

## How to use it

1. **Cold start:** read this file + operator.yaml + compiled/harness-reminders.md
   (if it exists). That's it. Do not read entries/ unprompted.
2. **Topic active:** grep index.json by tag or type; read only matched entries.
3. **New correction / decision / dead-end:** write a new entry to entries/
   per the schema. Never rewrite existing entries.
4. **Promotion or curation:** user runs `/playbook-distill` or similar —
   do not do these steps unprompted.

## Retrieval cheatsheet

- "why did we…" → grep index.json for relevant tags, read matched entries
- "what's blocked / open" → filter index.json for type: open-question
- "what did the user say about…" → read operator.yaml
- "what not to try" → filter index.json for type: dead-end

## State pointers

See state.json for current branch, active feature, open PRs, and the
last-known-good commit.

## Phase 1 scope

Capture + retrieve. Not yet implemented:
- Auto-distillation of session transcripts (Phase 2)
- Constraint enforcement via pre-tool-use hooks (Phase 4)
- Compiled human narrative (Phase 3)
- Auto-applied harness artifacts (never without diff review)
```

## Step 4 — Update state.json from the working tree

If this is a git repo:
- `git rev-parse --abbrev-ref HEAD` → `active_branch`
- `git rev-parse HEAD` → `last_known_good_commit` (assumes current HEAD builds; user can correct)
- `gh pr list --json number,title --state open 2>/dev/null` → `open_prs` if `gh` available

If not a git repo, leave these null. The user can set them later.

## Step 5 — Confirm

Tell the user what was created. Suggest next steps:

- Run `/playbook-log` when the next loggable thing happens (correction, decision, dead-end).
- `/playbook-recall <tag>` to search entries once there are any.
- Edit `operator.yaml` directly when their context on this project shifts — don't silently overwrite; update `as_of`.

## What this command does NOT do

- Does not register hooks in `settings.local.json`. The user installs the
  plugin; hook registration is separate.
- Does not create any entries. The playbook starts empty; entries accrue
  through use.
- Does not write compiled outputs. `compiled/` stays empty until Phase 3.
- Does not touch CLAUDE.md or repo-level files. Playbook lives under
  `/memories/`, not in the repo tree.

## Error handling

- If `memory.view /memories/` fails (tool not enabled), stop and tell the
  user: the playbook requires the `memory_20250818` tool to be enabled
  for this session.
- If any `memory.create` fails partway, report which files succeeded and
  which didn't. Do not auto-retry silently.
