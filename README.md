# Priors

<p align="center">
  <a href="#install"><img src="https://img.shields.io/badge/MCP-Compatible-000000?style=for-the-badge&logo=anthropic&logoColor=white" alt="MCP"></a>
  <a href="#install"><img src="https://img.shields.io/badge/Local--first-CLI-1E90FF?style=for-the-badge" alt="Local-first"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-3DA639?style=for-the-badge" alt="License: MIT"></a>
  <a href="#status"><img src="https://img.shields.io/badge/Status-v1-blueviolet?style=for-the-badge" alt="Status: v1"></a>
</p>

> Records why a project moves the way it does, so the next agent inherits its shape without being told.

Priors is a typed, project-scoped log of decisions, dead ends, constraints, and open questions. Written by the agents working on a project, curated by you, readable by whoever (or whatever) shows up next. A fresh Claude Code session reads the brief and gets oriented in seconds. A new teammate reads the same file. The store lives in your repo as plain markdown plus YAML plus JSON. Open it in any text editor. Diff it in git.

Works inside the agent client you already use. Reference clients are [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Cursor](https://cursor.com), and the [Codex CLI / OpenAI Agents SDK](https://github.com/openai/openai-agents-python). Anything that speaks MCP can read and write the same store.

---

## What it fixes

Three patterns run through the field, and Priors is built around the answers to them.

**Memory tools store the wrong subject.** The category answers _what does the AI know about me?_ That question is saturated, commoditizing, and weak. It also produces a documented failure mode: when frontier models retrieve "user prefers X" as a present-tense fact, accuracy falls hard (GPT-4o drops from 98% to 64% on the belief-vs-fact reframing, per the AI Index 2026). Priors stores "as of April 12 the team chose X because of Y, evidence in commit `abc`." Different epistemic object. Survives stale belief because it was never present-tense to begin with.

**Free text loses causality.** "We chose X" records the outcome and loses everything else. Six months later you cannot ask what was rejected, what changed, when to revisit. Priors entries are typed (`decision`, `failure`, `constraint`, `pattern`, `question`) with their own schemas. You can ask `recall(filter: rejected)` and get the dead ends with their reasons. You can ask `recall(status: contested)` and see the live disagreements. Causality is queryable.

**Conflicts get silently overwritten.** Most stores append or merge when new evidence disagrees with old. The disagreement is the signal. Priors keeps both entries. `link_entries(a, contradicts, b)` sets both to `contested` and surfaces them together in the brief. The old layer keeps its shape after it stops being current. New facts do not paper over old ones; the disagreement is queryable.

---

## What it does

|                                    |                                                                                                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Brief the new arrival**          | A bounded, deterministic orientation at `priors://brief`. IDs and one-line summaries. No LLM in the assembler. Two runs, byte-identical output.                                                |
| **Recall the dead ends**           | `recall(filter: rejected)` returns the approaches you ruled out, with the reason. Failures are first-class entries, not afterthoughts.                                                         |
| **Stage, never auto-commit**       | `priors stage` produces up to five candidate entries, each with a verbatim quote substring-verified against the source. Nothing enters the active store until you approve.                     |
| **Conflict-as-data**               | Both sides preserved. The brief surfaces the disagreement. Resolve later if the evidence supports it.                                                                                          |
| **Dated, sourced claims**          | Every entry carries an `as_of` and source refs. Retrievals frame claims with their date, not as eternal truth.                                                                                 |
| **Cross-client portability**       | The `.priors/` folder is the contract. Markdown plus YAML plus JSON. Export to a portable pack. Import on another machine with `--dry-run` defaulting on. ID is canonical, path is incidental. |
| **Local-first, no infrastructure** | No daemon. No database. No vector store. No cloud account. The MCP server runs when a client invokes it; the CLI runs when you invoke it. Everything else is files.                            |

---

## The store

```
.priors/
  project.json          UUID, name, created_at
  entries/              active entries, by kind
    decisions/  failures/  constraints/  patterns/  questions/
  staged/               candidates awaiting approval
  indexes/all.json      fast lookup, regenerated on every write
  audit/                every write logged with timestamp and source
  exports/              portable packs from priors export
  brief.md              regenerated by priors brief
  log.md                chronological project trajectory
```

Directory-backed. Git-friendly, grep-friendly, diff-friendly. The format is the contract; the MCP server and CLI are one implementation. Anything that can read a file can consume the same store.

---

## Install

```bash
npm install -g priors-mcp
priors init
```

`priors init` creates a `.priors/` folder, generates a project UUID, and prints the MCP config snippet for your client. To wire up Claude Code, paste it into your `mcp.json`:

```json
{
  "mcpServers": {
    "priors": {
      "command": "priors-mcp",
      "args": ["--project-root", "."]
    }
  }
}
```

Equivalent snippets for Cursor and the Codex CLI live in [`docs/integrations.md`](docs/integrations.md). Or run:

```bash
priors init-config --client claude
priors init-config --client cursor
priors init-config --client codex
```

---

## Getting started

```bash
priors init                  create .priors/ in the current project
priors brief                 read the orientation document
priors stage <transcript>    produce candidate entries from a session log
priors commit <staged-id>    promote a staged entry to active
priors recall <query>        search the index
priors recall --rejected     list dead ends with their reasons
priors recall --contested    list disagreements
priors link <a> contradicts <b>      record a disagreement
priors mark-stale <id>       soft-deprecate an entry without deleting
priors export ./pack.zip     export a portable pack
priors import ./pack.zip --dry-run   preview what would change
priors health                self-check the store
priors evals                 run the regression suite
```

The CLI mirrors the MCP surface one-to-one. Whatever an agent can do through MCP, you can do at the terminal.

---

## What an entry looks like

Plain markdown, YAML frontmatter, one file per entry:

```markdown
---
id: priors-20260420-supabase-rls
kind: decision
project: priors
created_at: 2026-04-20
as_of: 2026-04-20
status: active
confidence: high
source_refs:
  - file: src/auth/policies.sql
  - commit: 7ea11c4
relations:
  supersedes: [priors-20260318-supabase-noauth]
---

## Claim

Use Supabase Row Level Security with `auth.uid()` for all user-scoped tables.

## Context

Earlier we used a single service-role key from the API server. One bug in
route handling could leak any user's data.

## Evidence

PR #142 added a regression test that exercises the policies directly.
The original "noauth" approach is preserved and marked superseded.

## Implications for future agents

RLS is the boundary. Do not stack server-side authorization checks that
duplicate it. Do not bypass it with the service role outside admin scripts.

## Failure mode if misapplied

Two sources of truth hide RLS bugs behind app-layer correctness. The team
has done this before.
```

---

## What the brief looks like

`priors://brief` returns a bounded document. IDs and summaries only. Pull deeper with `get_entry(id)` when you need to.

```markdown
# priors brief

project: priors • generated: 2026-04-26 14:02 UTC • 47 active entries

## Goal

v1 ships a project trajectory substrate with deterministic brief and
conservative staged distillation. (priors-20260301-v1-scope)

## Active decisions

- Row Level Security for all user-scoped tables. (priors-20260420-supabase-rls)
- TypeScript over Python for the MCP server. (priors-20260305-typescript)
- ID is canonical, path is incidental. (priors-20260311-id-vs-path)

## Active constraints

- Brief must respond in under 300ms. (priors-20260318-brief-latency)
- No LLM call in the brief assembler. (priors-20260318-brief-determinism)

## Contested

- Whether staged entries should auto-expire. Both sides preserved.
  (priors-20260402-stage-expiry-yes vs priors-20260408-stage-expiry-no)

## Recently superseded (last 14 days)

- priors-20260318-supabase-noauth → priors-20260420-supabase-rls

## Open questions

- Is `priors://log` paginated or returned whole? (priors-20260415-log-shape)

## Next look

- 8 staged entries awaiting review. Run `priors review-staged`.
```

---

## What this is not

|                             |                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Another AI memory tool      | The subject is the project, not the user and not the AI.                                                       |
| RAG with relations          | RAG retrieves what exists. Priors records why the project moved.                                               |
| A chatbot personality layer | A substrate. An agent runtime should write to it and read from it; Priors does not try to be the agent.        |
| A note-taking app           | Notes do not have a brief, do not surface conflicts, and do not get refused when their evidence is fabricated. |
| A backend service           | A folder in your repo.                                                                                         |

---

## Commitments

These are lines in the sand. Each traces to a specific risk identified during the v1 design.

- **The project is the subject.** No `user.json`. No user-preference entries. No identity claims. No psychology. Storing those reproduces the belief-vs-fact failure mode that breaks frontier models.
- **The brief is deterministic.** No LLM in the assembler. Two runs against the same store produce byte-identical output. Tests enforce it.
- **Quote, or refuse.** Every staged claim is supported by a verbatim substring of the source. The check runs in code, not in the prompt. Rejections go to `audit/distillation-rejects.log`.
- **Stage, never commit.** Distillation only writes to `staged/`. Hooks may stage; hooks may not commit. There is no auto-commit, anywhere, ever.
- **Conflict is data, not noise.** Both sides preserved. The disagreement is queryable.
- **Local files are canonical.** No database, no vector store, no embeddings, no daemon, no cloud sync, no account model. v1 has none of these and is not adding them.
- **ID is canonical, path is incidental.** Project identity is a UUID. Identity survives directory rename.
- **Idempotency on every write.** Every MCP write tool accepts a `client_request_id`. Agents retry; networks fail; without idempotency you get duplicates.

---

## v1 scope

**In:**

- Local store at `.priors/` (markdown plus frontmatter, JSON for state)
- MCP server with three resources (`priors://brief`, `priors://index`, `priors://entry/{id}`) and six tools (`recall`, `get_entry`, `stage_learning`, `commit_learning`, `mark_stale`, `link_entries`)
- CLI mirroring the MCP surface
- Deterministic brief assembly within a hard token ceiling
- Conservative staged distillation with mandatory quoted evidence
- Export and import with `--dry-run` defaulting on
- Setup snippets for at least three MCP clients
- Seven-task regression suite

**Out, deliberately deferred:**

- Decay scoring, helpful or harmful counters, activation tracking
- Auto-distillation hooks (manual `priors stage` only)
- `emit_constraint` (natural-language rules to executable checks)
- Multi-project or team-shared store
- Web UI, dashboard, browser viewer
- Vector store, embeddings, semantic search
- Cloud sync, accounts, anything that requires a server beyond the local MCP
- Background daemons of any kind

Each deferred item has a section in [`project-brief.md`](project-brief.md) explaining what it would need to ship well. PRs that pull v1 toward any of them get sent back to that section.

---

## Lineage

The pieces Priors leans on, named:

- **Reflexion (2023)** for treating failure traces as the high-value signal.
- **ACE (Oct 2025)** for "compression loses information you cannot predict at capture time, so preserve and filter at read time."
- **ReasoningBank (NeurIPS 2026)** for the gap between failure capture and failure curation.
- **AI Index 2026** on the belief-vs-fact vulnerability (DeepSeek R1 dropping from 90%+ to 14.4% accuracy under user-belief framing). This is why Priors stores dated facts and not present-tense user beliefs.
- **The Foundation Model Transparency Index** (down 18 points year-on-year) for why the user's own curated layer is increasingly the only inspectable surface.

Closest precedents: claude-mem captures episodes but emits no harness artifacts. Karpathy's LLM Wiki compiles knowledge but stays read-only. Anthropic's `/team-onboarding` is user-scoped, not decision-scoped. None of them treat the project as the persistent subject. That is the move.

---

## Documentation

| Doc                                                          | What's covered                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                                     | Operating contract for any agent entering this repo. Read first.                  |
| [`project-brief.md`](project-brief.md)                       | Positioning, audiences, headline rituals, deferred-item rationale.                |
| [`spec-brief-resource.md`](spec-brief-resource.md)           | Locked spec for `priors://brief`. Ranking rules and edge cases.                   |
| [`spec-staged-distillation.md`](spec-staged-distillation.md) | Locked spec for `stage_learning`. Quote-or-refuse rule and verification contract. |
| [`claude-code-handover.md`](claude-code-handover.md)         | Phase-by-phase implementation plan.                                               |
| [`docs/integrations.md`](docs/integrations.md)               | MCP client config snippets.                                                       |
| [`docs/evals.md`](docs/evals.md)                             | How the seven-task regression suite works.                                        |

---

## Status

v1 is in active implementation. The four spec docs are locked. The seven-task regression suite is the definition of done. Once it passes, v1 ships.

Priors uses Priors. Decisions made during v1 are staged and committed into the project's own `.priors/`. By the time it ships, the dogfood story is the demo.

---

## Contributing

```bash
git clone https://github.com/<your-org>/priors.git
cd priors
npm install
npm test
```

Read [`AGENTS.md`](AGENTS.md) before opening a PR. The non-negotiables there are not style preferences. They trace to specific risks identified in the brief and the specs. PRs that violate them get sent back with a pointer.

To propose a feature currently deferred, open an issue rather than a PR. The deferred-item sections in [`project-brief.md`](project-brief.md) are the place to argue for the missing pieces.

---

## The test

A fresh agent, given only a project's `.priors/` and no conversation history, makes decisions consistent with the project's actual constraints on held-out cases.

That is the bar. If a Priors-equipped project does not change what a fresh agent does on its first turn, the system is not earning its place.

---

## License

MIT. See [LICENSE](LICENSE).
