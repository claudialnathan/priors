# Maintainer guide — how to test Priors without being a developer

This guide is for non-developer maintainers (reviewers, technical PMs, designers) who want to verify Priors is working on a real project without writing code.

You will need:

- A Claude Code or Cursor session open in your project.
- The `priors` plugin installed (or this repo cloned and pointed at as a plugin path).
- A `.priors/` folder in your project (run `npm exec priors init` once if it does not exist).

Try the prompts below in order. Each one tests a specific piece of the system.

---

## 1. Project context loads automatically

Open a new chat and ask:

> What does Priors know about this project?

**Expect:** the agent summarises the project brief — active decisions, constraints, open questions. The agent should not ask you for more context unprompted.

Behind the scenes: `SessionStart` hook ran `priors hook session-start`, which emitted the brief head.

If the response is empty or the agent says "I don't have any context", check `.priors/project.json` exists and run `priors status` from a terminal.

---

## 2. Recall finds relevant priors

Ask:

> Recall what we decided about the human interface.

**Expect:** the agent runs `/recall` (or `priors recall`) under the hood, returns a list of matching priors using readable IDs (e.g. `D-001`, `R-002`), and avoids dumping full entry bodies.

If you've never logged anything, it should say "no matches" and suggest `/priors:log` or `/priors:rule-add`. It should not invent matches.

---

## 3. Direct write via natural language

Type:

> Can you log this? We chose readable IDs (`D-001`, `R-002`) over raw UUIDs because users were treating Priors like database admin instead of agent memory.

**Expect:**

- The `UserPromptSubmit` hook detects the log intent.
- The agent translates your phrasing into a neutral durable claim, calls `/priors:log`, and shows you the new readable ID.
- Run `priors recall --query "readable IDs"` afterwards to confirm the entry exists.

---

## 4. Rule assertion

Type:

> This is a rule: do not appease me on outdated framework advice. If priors or current docs say otherwise, push back.

**Expect:**

- The agent recognises the rule intent.
- It calls `/priors:rule-add "<rule>" --priority high`.
- `priors rules` (terminal) lists the new rule with `[high/user]` priority.

---

## 5. Pushback when repeating a rejected approach

After step 3, ask:

> Let's expose the canonical UUID retrieval as the main UX path.

**Expect:** the agent responds with the pushback format:

```
This approach has been tried and rejected.

On <date>, we chose readable IDs over raw UUIDs because …

Relevant prior:
- D-001: <title>

I recommend keeping IDs internal and exposing /priors:recall, /priors:why, …
```

If the agent agrees with you instead, say:

> Why are you pushing back?

…wait, that's the wrong direction. If the agent did NOT push back, the rule from step 4 was not loaded — that's a bug. Run `/priors:reflect` to see if Priors flagged it.

---

## 6. Why explanation

Ask:

> Why are you pushing back?

**Expect:** the agent runs `/priors:why`, listing the priors and rules consulted in this session. Each line is a readable ID + title.

---

## 7. Impact at end of session

Before closing the chat, ask:

> Did Priors help this session?

**Expect:** the agent runs `/priors:impact`. The report shows pushbacks made, rules applied, priors recalled, candidates proposed, and any "possible misses" (e.g. user log intents that did not result in a write).

---

## 8. Drift / appeasement check

Ask:

> Run a drift check across the priors.

**Expect:** the agent runs `/priors:reflect`. Flags include:

- `stale_freshness` — priors about fast-moving tools that haven't been refreshed.
- `user_emotion_as_fact` — claims with emotional language (review and rewrite in neutral voice).
- `overstated_confidence` — agent-authored rules marked confidence:high.
- `broad_one_off_rule` — `always` / `never` rules with low confidence.
- `repeated_rejection` — pushbacks that fired more than once this session.

If the report says "no drift, appeasement, or freshness flags", the store is clean.

---

## 9. Export a Markdown handover snapshot

Ask:

> Export a Markdown handover snapshot.

**Expect:** the agent runs `/priors:export md`. You get the deterministic brief plus a path to a portable export pack at `.priors/exports/handover-<date>/`.

You can paste the brief output directly into a doc, GitHub issue, or Notion page — it's already shaped for human readers.

---

## 10. Mode switch

If your project is in active flux and you want to stop auto-logging at checkpoints:

> Switch Priors to manual mode.

**Expect:** the agent runs `priors mode manual`. From this point until the next `priors mode auto`, Priors will only write when you explicitly say "log this" / "this is a rule".

Read paths (recall, brief, pushback, rules) keep working in both modes.

---

## What to do if something fails

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "I don't have any context" at session start | `.priors/` not initialized in this project | `npm exec priors init` |
| Slash commands don't appear | Plugin not enabled in Claude Code | Check plugin path in settings |
| MCP tools don't appear | `.mcp.json` not picked up | Verify `${CLAUDE_PLUGIN_ROOT}` resolves in your install |
| Agent agrees with you instead of pushing back | Rule not loaded | `/priors:reflect` to see drift; consider re-adding the rule |
| `/priors:impact` is empty | No session events recorded | Hooks may have failed silently — check `.priors/audit/session.jsonl` |
| Logs contain raw user emotion as claims | Agent skipped translation | `/priors:reflect` will flag; rewrite via `/priors:log` and mark the bad one stale |

---

## Reading the store directly

If something looks off, the store is plain files. You can open them in any editor:

- `.priors/entries/rules/*.md` — active rules.
- `.priors/staged/*.md` — pending review (auto-mode candidates).
- `.priors/audit/session.jsonl` — session events for the last few days.
- `.priors/audit/curation.log` — staging / promotion / discard history.
- `.priors/indexes/all.json` — full index, regenerated on every write.
