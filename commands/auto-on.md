---
description: Enable per-prompt operator-context injection for this project. Opt-in; off by default.
---

# /priors:auto-on

Turn on ambient per-prompt injection of operator context for this project.
The plugin's `UserPromptSubmit` hook is always registered (plugins have no
user-toggle mechanism), but it stays silent by default. This command
creates a flag file that the hook checks before emitting; flip it off
with `/priors:auto-off`.

**Cost implication:** roughly +150–250 tokens per user prompt while the
flag is set. Off by default because most users don't need ambient
reinforcement — the cold-start `SessionStart` hook already loaded the
operator context once per session.

## What it does

```bash
slug="$(pwd | sed 's|/|-|g')"
store="$HOME/.claude/projects/$slug/priors"
touch "$store/.auto-on"
```

That's it. From the next prompt onward, `hooks/user-prompt-submit.sh`
sees the flag and emits the `<priors-operator>` block.

## Preflight

1. Resolve `$store` via the Bash block above.
2. If `$store` doesn't exist: tell the user to run `/priors:init` first
   and stop. No store → no operator.yaml to inject.
3. If `$store/.auto-on` already exists: report "auto-inject is already
   on" and stop. No-op.
4. Otherwise: `touch` the flag, then confirm.

## Confirmation

After enabling, report:

```
Auto-inject enabled for this project.
Flag: $store/.auto-on
Every prompt will now get a compact <priors-operator> block from
operator.yaml (first 5 preferences, capped). Run /priors:auto-off to
revert.
```

## Safety

- Do not touch `.claude/settings.local.json`. The plugin's hook is
  always registered via `hooks/hooks.json`; this command only flips
  the runtime flag.
- Do not write any other files in the store. Just the flag.
- Scope is project-local — flipping the flag in one project does not
  affect any other project.
