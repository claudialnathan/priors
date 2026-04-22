---
description: Update /memories/playbook/state.json with live harness pointers — current branch, active feature, open PRs, known-broken list.
---

# /playbook-state

Refresh `state.json` from the working tree. Narrow scope: things that are
true *right now* about the codebase.

## What goes in state.json

```json
{
  "updated": "<ISO-8601 timestamp>",
  "active_branch": "feat/playbook-phase-1",
  "last_known_good_commit": "abc1234",
  "active_feature": "playbook-phase-1-capture",
  "open_prs": [
    {"number": 42, "title": "Scaffold playbook commands"}
  ],
  "known_broken": []
}
```

Keep it small. This file is read on every session start — bloat here is
a direct context tax.

## Update procedure

1. `memory.view /memories/playbook/state.json` to read current state.
2. Collect fresh values:
   - `active_branch`: `git rev-parse --abbrev-ref HEAD 2>/dev/null`
   - `last_known_good_commit`: ask the user OR default to current HEAD.
     *Do not silently assume HEAD builds.* If unsure, keep the existing
     value.
   - `open_prs`: `gh pr list --json number,title --state open 2>/dev/null`
     if `gh` is available. Otherwise keep the existing value or set to
     `[]`.
   - `active_feature`: ask the user unless it's obvious (e.g., branch
     name starts with `feat/`). Propose, don't assume.
   - `known_broken`: user-managed. Don't touch unless they tell you to
     add/remove something.
3. Show the proposed diff.
4. On approval, write via `memory.create` (overwrite) or
   `memory.str_replace` for targeted edits.

## When to run

- User explicitly asks ("update state", "refresh state", "/playbook-state").
- At the start of a new feature or after a branch switch, if the state
  file is clearly stale (active_branch doesn't match current).
- Do NOT auto-run this on every prompt or edit. That thrashes the file
  and invalidates cache.

## What NOT to do

- Do not put decision-type data here. Decisions go in `entries/` as
  `decision` entries.
- Do not put operator preferences here. Those live in `operator.yaml`.
- Do not assume `last_known_good_commit = HEAD`. A broken HEAD is a real
  state — the field should reflect it truthfully.
- Do not list every file that's changed. This is harness state, not a
  git diff.
