---
description: Enable per-prompt operator-context injection by registering the UserPromptSubmit hook in settings.local.json. Opt-in; off by default.
---

# /priors-auto-on

Turn on ambient per-prompt injection of operator context. By default the
priors tool only uses the `SessionStart` hook (one-time cold-start cost);
this command adds the `UserPromptSubmit` hook, which reads
`operator.yaml` and emits a compact system-reminder on every user prompt.

**Cost implication:** roughly +150–250 tokens per user prompt for the
session lifetime of the setting. Intentionally opt-in because most users
don't need ambient reinforcement — the cold-start handoff already loaded
the operator context.

## When to run

- User explicitly asks: "turn on auto-inject", "enable operator reminders",
  `/priors-auto-on`.
- User has run several sessions where the agent forgot operator preferences
  mid-conversation and wants a persistent reminder.

## Preflight

1. Read `.claude/settings.local.json`.
2. Check the `hooks` block for an existing `UserPromptSubmit` registration
   that points at `.claude/hooks/user-prompt-submit.sh`.
3. If it already exists, tell the user "auto-inject is already on" and
   stop. Do not duplicate the registration.

## Patch procedure

1. Show the user the current `hooks` block.
2. Show the proposed addition:

   ```json
   "UserPromptSubmit": [
     {
       "matcher": "",
       "hooks": [
         {
           "type": "command",
           "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/user-prompt-submit.sh",
           "timeout": 2
         }
       ]
     }
   ]
   ```

3. Ask for confirmation. On approval, use `Edit` to insert the block into
   the `hooks` object, placed after `SessionStart` if present. Preserve
   the rest of the file byte-for-byte.

4. Confirm: "Auto-inject enabled. Restart the session (or open a new one)
   for the hook to take effect on prompts."

## Safety

- Do not rewrite the whole file — only edit the `hooks` block.
- Do not touch `permissions` or `enabledMcpjsonServers`.
- If the file is malformed JSON before you edit, stop and surface the
  parse error to the user. Do not attempt to "fix" unrelated issues.

## Inverse

Running `/priors-auto-off` removes the registration.
