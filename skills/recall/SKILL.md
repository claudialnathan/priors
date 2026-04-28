---
description: Search Priors for relevant decisions, failures, constraints, rules, and questions.
argument-hint: <topic-or-keywords>
---

The user wants to recall priors about: $ARGUMENTS

Run:

```
node ${CLAUDE_PLUGIN_ROOT}/bin/priors.js recall --query "$ARGUMENTS" --limit 10 --project-root "${CLAUDE_PROJECT_DIR:-$PWD}"
```

Present the hits using readable IDs (do not show raw canonical IDs unless the user asks). For each hit show:

- `<readable-id> — <claim>`  
  kind, status, confidence, as_of date

If a hit is a `failure` or has status `contested`, flag it visibly so the user notices.

If nothing matches, say so plainly and suggest narrower or broader keywords. Do not invent matches.
