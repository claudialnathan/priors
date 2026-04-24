---
description: Disable per-prompt operator-context injection for this project. Restores the default silent behavior.
---

# /priors:auto-off

Turn off ambient per-prompt injection of operator context for this
project. Removes the flag file that `/priors:auto-on` created; the
`UserPromptSubmit` hook stays registered (as a plugin hook always is)
but goes back to silent.

## What it does

```bash
slug="$(pwd | sed 's|/|-|g')"
store="$HOME/.claude/projects/$slug/priors"
rm -f "$store/.auto-on"
```

## Preflight

1. Resolve `$store` via the Bash block above.
2. If `$store/.auto-on` doesn't exist: report "auto-inject is already
   off" and stop.
3. Otherwise: `rm -f` the flag, then confirm.

## Confirmation

```
Auto-inject disabled for this project.
The UserPromptSubmit hook will be silent until /priors:auto-on is run again.
```

## Safety

- Do not touch `.claude/settings.local.json`. The plugin's hook is
  always registered via `hooks/hooks.json`; this command only flips
  the runtime flag.
- Scope is project-local.
- Re-enable with `/priors:auto-on`.
