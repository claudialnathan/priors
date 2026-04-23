---
description: Disable per-prompt operator-context injection by removing the UserPromptSubmit hook from settings.local.json. Restores the default (cold-start only).
---

# /priors-auto-off

Turn off ambient per-prompt injection of operator context. Returns the
project to the default behavior: `SessionStart` hook fires once at cold
start, no per-prompt cost. The `user-prompt-submit.sh` script stays on
disk and untouched — only the hook registration is removed.

## When to run

- User asks: "turn off auto-inject", "stop the per-prompt reminder",
  `/priors-auto-off`.
- Token budget concerns during a long session; user wants to drop the
  ambient cost.

## Preflight

1. Read `.claude/settings.local.json`.
2. Check whether a `UserPromptSubmit` block is registered and points at
   `.claude/hooks/user-prompt-submit.sh`.
3. If nothing is registered, tell the user "auto-inject is already off"
   and stop.
4. If the registered hook points at a different script (not
   `user-prompt-submit.sh`), STOP. Do not remove someone else's hook.
   Surface the finding to the user.

## Patch procedure

1. Show the current `hooks` block.
2. Show the proposed removal (the `UserPromptSubmit` entry).
3. On confirmation, `Edit` the file to remove the block. If this empties
   the `hooks` object entirely, leave `"hooks": {}` — don't delete the key.
4. Confirm: "Auto-inject disabled. New sessions will not run the per-prompt
   hook."

## Safety

- Only remove the specific `UserPromptSubmit` block that references
  `user-prompt-submit.sh`. Never remove arbitrary hook blocks.
- Do not touch other top-level keys.
- Re-enable with `/priors-auto-on`.
