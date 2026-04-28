# AGENTS.md — Priors

Any agent operating on or with this project reads this file first.

If something here conflicts with `docs/specs/brief-resource.md` or `docs/specs/staged-distillation.md`, the spec wins on the surface it covers.

---

## What this project is

**Priors is always-on project memory for Claude Code and Cursor.**

Decisions, dead ends, constraints, open questions, and user-authored rules live as plain Markdown + JSON in `.priors/` inside each project's repo. An MCP server exposes a deterministic orientation brief and a small set of read/write tools. A bundled Claude Code plugin and Cursor rules turn those tools into slash commands, hooks, and a steward subagent.

The persistent subject is the **project**. Not the user. Not the AI. If the code you are about to write treats the user as the subject (storing user preferences, building a user profile, generating user-shaped retrieval), stop. You have drifted out of category.

The single useful question to ask at any decision point: _is the subject of what I am about to build the project, the user, or the AI?_ If the project, you are aligned.

---

## Modes — memory use vs. memory writing

Priors has two modes. **Memory use is always on.** What changes between modes is **writing**.

| | Auto | Manual |
| --- | --- | --- |
| Read brief at session start | yes | yes |
| Recall before non-trivial decisions | yes | yes |
| Push back on rejected approaches | yes | yes |
| Apply active rules | yes | yes |
| Auto-stage durable observations at checkpoints | yes (with significance gate) | no |
| Direct write on user "log this" / "this is a rule" | yes | yes |
| Direct write without explicit user ask | no, ever | no, ever |

Switch modes with `priors mode auto|manual`.

Auto mode is _bounded_. The significance gate refuses empty / noise-only / weak-signal candidates. False negatives are recoverable (the user can always say "log this"); false positives clog the index.

---

## Reading order

Each is short. Read all three before non-trivial changes.

1. `docs/plugin-architecture.md` — the plugin-first surface and how it maps to MCP.
2. `docs/specs/brief-resource.md` — locked spec for `priors://brief`.
3. `docs/specs/staged-distillation.md` — locked spec for `stage_learning` (the internal review-queue path).

After reading, if you are about to make non-trivial changes, write a one-paragraph summary of what you understand the project to be. If your summary describes Priors as "a memory system" or "an AI memory tool," go back and re-read.

---

## Non-negotiables

These cannot be relaxed.

### 1. The subject is the project

Not the user, not the AI. No `user.json`. No identity claims. No psychology. These belong to consumer memory products. Priors entries are dated, sourced, and project-scoped.

### 2. Curation is the product

Storage is cheap. Retrieval is mostly solved. The hard product question is what to keep and how to surface it. For every memory feature, define: capture trigger, admission criteria, conflict behavior, deletion behavior, evidence requirement, user review surface.

### 3. Progressive disclosure

```
brief → search/index → full entry → audit trail
```

The brief gives readable IDs and one-line summaries. Agents pull deeper only when needed.

### 4. Quote, or refuse

Every claim staged by `stage_learning` must be supported by a verbatim quote from the source content. The verification step is implemented in code (substring match plus a Dice-coefficient grounding floor), not in the prompt. No exceptions for agent-authored content.

The user-authored direct-write paths (`/priors:log`, `/priors:rule-add`) bypass quote-or-refuse because the user typed the claim. The check exists to protect against agent hallucination, not human input.

### 5. The brief is deterministic

`priors://brief` is assembled, not generated. No LLM call inside the assembler. Two runs against the same store produce byte-identical output.

### 6. Local-first, file-based

The `.priors/` directory is the canonical store. Markdown + JSON. No database. No vector store. No embeddings. No daemon. No cloud. The store should open in any text editor.

### 7. Idempotency keys on every write

Every MCP write tool accepts a `client_request_id`. Agents retry; networks fail. Without idempotency, you get duplicate entries.

### 8. Failures are first-class

Failed approaches carry the highest-value information for future agents. Log: failed approach, symptoms, root cause, misleading signals, eventual correction.

### 9. Readable IDs in human-facing UX

Human-facing flows show readable IDs (`D-001`, `F-004`, `R-002`). Canonical IDs appear only in `--json` output, exports, and debug paths. Do not reintroduce raw-id-typing as a normal flow.

### 10. Pushback over appeasement

When a user proposal conflicts with an active prior, agents must push back using the canonical format (see "Pushback format" below). Saying "you're right" when priors say otherwise is a failure mode, not politeness.

---

## Where things live

```
.priors/                      # the store (one per user project, lives in that project's repo)
  project.json                # UUID, name, created_at
  config.json                 # mode (auto|manual), groundingMode, commitThreshold
  entries/                    # active entries by kind
    decisions/  failures/  constraints/  patterns/  questions/  hypotheses/  rules/
  staged/                     # the review queue: candidates awaiting promotion
  indexes/all.json            # regenerated on write; includes readable_id, author, priority
  audit/
    actions.log               # append-only JSONL
    distillation-rejects.log  # quote-or-refuse failures
    curation.log              # propose / stage / reject / accept events
    session.jsonl             # per-session events for /why, /impact, /reflect
  exports/                    # generated by `priors export`
  brief.md                    # generated by `priors brief`

# this repo (when shipped as a plugin / npm package):
.claude-plugin/plugin.json    # Claude Code plugin manifest
.mcp.json                     # MCP server config (root, plugin form)
skills/<name>/SKILL.md        # one per slash command (auto-namespaced as /priors:<name>)
agents/priors-steward.md      # the steward subagent
hooks/hooks.json              # SessionStart, UserPromptSubmit, PreCompact, Stop
hooks/scripts/                # bounded shell scripts called by hooks
.cursor/rules/priors.mdc      # Cursor-side always-apply rule
.cursor/mcp.json              # Cursor MCP server config
bin/priors.js                 # executable: CLI + MCP via subcommand
src/                          # TypeScript implementation
tests/                        # unit + regression
```

---

## The MCP surface

Four resources, eleven tools. Names and shapes are stable.

### Resources

- `priors://brief` — bounded orientation document. Readable IDs and one-line summaries.
- `priors://index` — full index in JSON.
- `priors://entry/{id}` — full entry body and metadata. Resolves through index.
- `priors://audit/{id}` — filtered audit-log slice for a single entry.

### Tools

Read: `recall`, `get_entry`.

Review queue (internal staging is preserved as the safe write path for agent-proposed candidates):

- `stage_learning(...)` — quote-or-refuse + grounding-floor verification; writes to `staged/`; emits curation events.
- `edit_staged(...)` / `discard_staged(...)` / `commit_learning(...)` — review-queue lifecycle.
- `mark_stale(id, reason)` — soft state.

Edges: `link_entries`, `propose_edge`, `commit_edge`, `discard_edge`. Vocabulary: `supersedes`, `contradiction_of`, `derived_from`, `reinforces`, `caused_by`, `blocks`, `depends_on`, `refutes`.

### Plugin / agent surface (CLI subcommands the slash commands and hooks call)

- `priors mode [auto|manual]` — show or set the write mode.
- `priors status` — compact one-screen summary.
- `priors log "<claim>"` — direct write, user-authored. Skips quote-or-refuse; significance gate still runs as a safety net.
- `priors rule add "<rule>"` — direct write of a user-authored rule with priority and area.
- `priors rules` — list active rules.
- `priors why` — show what's been consulted in this session.
- `priors impact` — render the session-impact report.
- `priors reflect` — drift / appeasement / freshness flags.
- `priors resolve <readable-id|id>` — map readable ↔ canonical.
- `priors hook <event>` — bounded entry point for hook scripts (`session-start`, `user-prompt`, `pre-compact`, `stop`).

### What's preserved from the CLI surface

`priors init`, `priors brief`, `priors recall`, `priors get`, `priors stage`, `priors commit`, `priors edit-staged`, `priors discard`, `priors mark-stale`, `priors link`, `priors propose-edge` / `commit-edge` / `discard-edge`, `priors audit`, `priors index`, `priors export`, `priors import`, `priors health`, `priors evals`, `priors mcp`, `priors init-config`, `priors migrate-relations`. These are still supported. The plugin commands call into the same code paths.

---

## Pushback format

When the user proposes something that repeats a rejected approach:

```
This approach has been tried and rejected.

On <date>, <attempt>, which led to <outcome>.

Relevant prior:
- <readable id>: <title>

I recommend <alternative> instead.
```

Always use readable IDs. List multiple priors as bullets if more than one applies. Always conclude with a recommended alternative.

The plugin includes a pure formatter at `src/intent/pushback.ts`. Use it.

---

## Natural-language log intents

These phrases are write intents:

- "log this" / "log that" / "save this to priors" / "add this to project memory"
- "remember this" / "make sure priors remembers this" / "make sure future agents remember this"
- "this is a rule" / "make this a rule" / "add a rule:"
- "we tried this and it failed" / "this approach failed" / "don't let this happen again"
- "always do this" / "never do this" / "this must hold"
- "we decided" / "decision:"
- "open question:"

Detection lives at `src/intent/log-intent.ts`. The `UserPromptSubmit` hook surfaces a one-liner when intent is detected; the `/priors:log` and `/priors:rule-add` commands do the actual write.

When writing, do not blindly copy emotional/frustrated wording. Translate to a neutral durable claim and preserve the original phrase as evidence. The `/reflect` surface flags entries whose claims contain emotional language.

---

## Significance gate

Before logging at a checkpoint, agents apply the gate at `src/intent/significance.ts`. It returns `log` (direct write — reserved for user-explicit asks), `propose` (add to the review queue), or `skip` (drop).

Log-worthy candidates have at least one strong signal:

- the user explicitly asked
- the user authored a rule
- supersedes / contradicts a prior decision
- a rejected approach surfaced during work
- a recurring correction appeared in the session
- a failure with transcript / diff evidence
- a decision surfaced at a meaningful checkpoint (pre-commit, pre-compact, session-end)
- the claim references future-agent value

Drop candidates that are: ordinary chat, generic summaries, temporary frustration, user emotion as fact, implementation details obvious from the code, every file change, every plan step, vague preferences with no future consequence.

Decision test: _would a future agent make a better decision because this exists?_ If no, do not log.

---

## What never to do

1. Do not auto-commit anything to `entries/` from agent inference. Direct writes are reserved for user-explicit asks (`/priors:log`, `/priors:rule-add`).
2. Do not store user preferences, identity, or psychology.
3. Do not generate the brief with a model.
4. Do not add a vector store, embedding-based search, or semantic ranking.
5. Do not add a daemon or any background process.
6. Do not break determinism in the brief or the index.
7. Do not use `additionalProperties: true` on any MCP schema.
8. Do not add a "fast path" through verification in `stage_learning`. Every agent-proposed candidate pays the verification cost.
9. Do not expose UUID retrieval as human UX. Readable IDs in normal flows; canonical IDs only in JSON / exports / debug.
10. Do not silently overwrite or delete entries to "tidy" the store.

---

## Definition of done

A change is done when:

1. The change advances the relevant spec or explicitly explains why a non-functional change was needed.
2. Tests run, pass, and cover empty / normal / adversarial cases.
3. Relevant docs are updated.
4. A `decision`, `failure`, or `rule` exists for any change that affects future agents.
5. The seven-task regression suite still passes.

---

## When uncertain

1. Search the repository.
2. Read the relevant spec end to end.
3. Check current public docs if the claim may have changed.
4. Stage a `question` rather than committing a false memory.
5. Propose the smallest verification step.

The single most useful question to ask: _is the subject of what I am about to build the project, the user, or the AI?_ If the project, you are aligned.
