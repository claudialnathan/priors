<p align="center">
  <em>A logbook for your AI-assisted projects.</em>
</p>

# Priors

<p align="center">
  <a href="#quick-install"><img src="https://img.shields.io/badge/MCP-Compatible-FFD700?style=for-the-badge" alt="MCP Compatible"></a>
  <a href="#getting-started"><img src="https://img.shields.io/badge/CLI-Local--first-blue?style=for-the-badge" alt="Local-first CLI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License: MIT"></a>
  <a href="#status"><img src="https://img.shields.io/badge/Status-v1-blueviolet?style=for-the-badge" alt="Status: v1"></a>
</p>

**The project's record of itself.** Priors keeps a typed log of decisions, dead ends, constraints, and open questions written by the agents working on a project, curated by you, and readable by whoever (or whatever) shows up next. A fresh Claude Code session opens the brief and inherits months of project shape in seconds. A new teammate reads the same file and gets the same orientation. The logbook lives in the repo, in plain markdown, and travels with the work.

Works inside the agent client you already use. The reference clients are [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Cursor](https://cursor.com), and the [OpenAI Codex CLI](https://github.com/openai/codex) (MCP in 0.4+), but anything that speaks MCP can read and write Priors. Switch tools, switch models, switch laptops; the substrate carries.

<table>
<tr><td><b>Brief the new arrival</b></td><td>A bounded, deterministic orientation document at <code>priors://brief</code>. IDs and one-line summaries for active decisions, constraints, contested items, recent changes, and open questions. Two runs against the same store produce byte-identical output. No LLM in the assembler, no surprises.</td></tr>
<tr><td><b>Recall the dead ends</b></td><td>At the start of a sub-task, call <code>recall</code> with <code>kind: failure</code> (or <code>priors recall --kind failure</code> in the CLI) to surface <code>failure</code> entries: what was tried, symptoms, and why the approach was set aside. Stop re-discovering the same dead end.</td></tr>
<tr><td><b>Stage the takeaways</b></td><td>End a hard session with <code>priors stage</code> (MCP: <code>stage_learning</code>). The distillation tool produces up to five candidate entries, each with a verbatim quote from the source as evidence. Substring-verified in code, not in the prompt. Nothing enters the active store until you <code>commit</code> it.</td></tr>
<tr><td><b>Conflict-as-data</b></td><td>When new evidence disagrees with an old learning, both stay. <code>link_entries(a, contradicts, b)</code> sets both to <code>contested</code> and surfaces them together in the brief. New facts do not silently overwrite old ones; the disagreement is the data.</td></tr>
<tr><td><b>Dated claims, not present-tense beliefs</b></td><td>Every entry has an <code>as_of</code>. Retrievals frame claims with their date, not as eternal truth. The pattern that breaks frontier models (the user-belief-as-fact failure) does not apply because no entry was ever written present-tense to begin with.</td></tr>
<tr><td><b>Cross-client portability</b></td><td>The store is markdown plus YAML plus JSON in a <code>.priors/</code> folder. Open it in any text editor. Diff it in git. Export to a portable pack with <code>priors export</code>, import on another machine with <code>priors import --dry-run</code> defaulting on. ID is canonical, path is incidental, identity survives directory renames.</td></tr>
<tr><td><b>Local-first, no infrastructure</b></td><td>No daemon. No database. No vector store. No cloud account. No background process. The MCP server runs when a client invokes it; the CLI runs when you invoke it. Everything else is files on disk.</td></tr>
</table>

---

## What this is not

| You might think             | But it's actually                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| Another AI memory tool      | A project record. The subject is the project, not the user and not the AI.                                |
| RAG with extra steps        | Causal, dated, decision-shaped. RAG retrieves what exists; Priors preserves why the project moved.        |
| A chatbot personality layer | A substrate. An agent runtime should write to it and read from it; Priors does not try to be the agent.   |
| A note-taking app           | A typed, audited, conflict-aware log with a deterministic orientation surface. Notes do not have a brief. |
| A backend service           | A folder in your repo.                                                                                    |

The category move: **memory tools answer _what does the AI know about me?_ Priors answers _what does the project know about itself?_**

---

## Quick install

Node **25+** is required (this project imports `.ts` directly via Node’s native type stripping). Runtime **npm dependencies: zero** for the shipped package.

```bash
npm install -g priors
cd your-project
priors init
```

If the package is not on the npm registry yet, clone this repo, run `npm link` from the project root, or call `node /absolute/path/to/bin/priors.js` as in [`docs/integrations.md`](docs/integrations.md).

`priors init` creates `.priors/` in the current directory and writes `project.json` with a new project UUID. It does not print MCP client configuration.

To wire up Claude Code, Cursor, or the Codex CLI, generate a config snippet (absolute paths to `node` and the `priors` entrypoint) and merge it into your client config — see [`docs/integrations.md`](docs/integrations.md). From your project:

```bash
priors init-config --client claude
priors init-config --client cursor
priors init-config --client codex
```

---

## Getting started

```bash
priors init                  # create .priors/ in the current project
priors brief                 # read the orientation document (same as priors://brief)
priors stage --source-kind session_log --source-ref my-session --source-content @transcript.md
priors commit <staged-id>  # promote a staged entry to active
priors recall --query "rls"  # plain-text search over the index
priors recall --kind failure  # list failure / dead-end entries
priors recall --status contested  # list contested entries
priors link <a> contradicts <b>   # record a disagreement
priors mark-stale <id> --reason "..."  # soft-deprecate an entry
priors export --destination ./export-pack  # write manifest + entries (directory)
priors import ./export-pack  # default: dry-run preview; add --apply to write
priors health                # self-check the store
priors evals                 # run the regression suite
```

The CLI mirrors the MCP surface one-to-one. Whatever an agent can do through MCP, you can do at the terminal.

---

## What an entry looks like

Plain markdown with YAML frontmatter:

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
  derived_from: []
---

## Claim

Use Supabase Row Level Security with `auth.uid()` for all user-scoped tables.

## Context

Earlier we used a single service-role key from the API server. This kept logic in
one place but meant a single bug in route handling could leak any user's data.

## Evidence

PR #142 added a regression test that exercises the RLS policies directly.
The original "noauth" approach is preserved in `priors-20260318-supabase-noauth`,
now marked superseded.

## Implications for future agents

Treat RLS as the boundary. Do not add server-side authorization checks that
duplicate it. Do not bypass it with the service role outside admin scripts.

## Failure mode if misapplied

Stacking server-side checks on top of RLS creates two sources of truth and
hides RLS bugs behind app-layer correctness. The team has done this before.
```

---

## What the brief looks like

`priors://brief` returns a bounded document. IDs and summaries only; never the full bodies. Pull deeper with `get_entry(id)` when you need to.

```markdown
# priors brief

project: priors • generated: 2026-04-26 14:02 UTC • 47 active entries

## Goal

v1 ships a project trajectory substrate with deterministic brief and
conservative staged distillation. (priors-20260301-v1-scope)

## Active decisions

- Use Row Level Security for all user-scoped tables. (priors-20260420-supabase-rls)
- TypeScript over Python for the MCP server. (priors-20260305-typescript)
- ID is canonical, path is incidental. (priors-20260311-id-vs-path)

## Active constraints

- Brief must respond in under 300ms. (priors-20260318-brief-latency)
- No LLM call in the brief assembler. (priors-20260318-brief-determinism)

## Contested

- Whether staged entries should auto-expire. Both sides preserved.
  (priors-20260402-stage-expiry-yes vs priors-20260408-stage-expiry-no)

## Recently superseded (last 14 days)

- priors-20260318-supabase-noauth → superseded by priors-20260420-supabase-rls

## Open questions

- Is `priors://log` paginated or returned whole? (priors-20260415-log-shape)

## Next look

- 8 staged entries awaiting review. Inspect `.priors/staged/` and use `priors commit <id>` to promote.
```

---

## How it works

```
.priors/
  project.json          # UUID, name, created_at
  entries/              # active entries, by kind
    decisions/  failures/  constraints/  patterns/  questions/
  staged/               # candidates awaiting your approval
  indexes/all.json      # fast lookup, regenerated on every write
  audit/                # every write logged with timestamp and source
  exports/              # portable packs from `priors export`
  brief.md              # generated by `priors brief`
  log.md                # chronological project trajectory
```

The MCP server exposes three resources (`priors://brief`, `priors://index`, `priors://entry/{id}`) and six tools (`recall`, `get_entry`, `stage_learning`, `commit_learning`, `mark_stale`, `link_entries`). Every tool has a concrete JSON schema with examples. Every write tool accepts a `client_request_id` for idempotency.

The CLI calls the same store and the same logic. A change to one is a change to both.

---

## v1 scope

**In:**

- Local store at `.priors/` (markdown plus frontmatter, JSON for state)
- MCP server with three resources and six tools
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
- Web UI or dashboard
- Vector store, embeddings, semantic search
- Cloud sync, account model, anything that requires a server
- Background daemons of any kind

Each deferred item has a section in [`docs/project-brief.md`](docs/project-brief.md) explaining what would be required to ship it well. Pull requests that pull v1 toward any of the deferred items will be sent back to that section.

---

## How Priors compares

|                                | Priors                      | Memory tools (Mem0, Letta, Zep)     | RAG over docs   |
| ------------------------------ | --------------------------- | ----------------------------------- | --------------- |
| Subject                        | Project                     | User                                | Documents       |
| Survives client switch         | Yes (MCP plus files)        | Vendor-bound                        | Yes             |
| Survives stale beliefs         | Yes (dated, sourced)        | Often no (present-tense user facts) | Depends on docs |
| Failures preserved             | Yes (first-class entries)   | Rare                                | No              |
| Conflict handling              | Both sides preserved        | Overwrite or merge                  | N/A             |
| Verification on capture        | Yes (substring quote check) | Usually none                        | N/A             |
| Auto-commit                    | Never                       | Often                               | N/A             |
| Local, inspectable             | Yes                         | Mostly cloud                        | Depends         |
| Substrate for an agent runtime | Yes                         | Often the runtime itself            | No              |

---

## Documentation

| Doc | What's covered |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | Operating contract for any agent entering this repo. Read first. |
| [`docs/project-brief.md`](docs/project-brief.md) | Positioning, audiences, headline rituals, v1 scope, deferred-item rationale. |
| [`docs/specs/brief-resource.md`](docs/specs/brief-resource.md) | Locked spec for `priors://brief`. Ranking rules and edge cases. |
| [`docs/specs/staged-distillation.md`](docs/specs/staged-distillation.md) | Locked spec for `stage_learning`. Quote-or-refuse rule, verification contract. |
| [`docs/integrations.md`](docs/integrations.md) | MCP client config snippets. |
| [`docs/evals.md`](docs/evals.md) | How the seven-task regression suite works. |

---

## Status

v1 is in active implementation. The four spec docs are locked. The seven-task regression suite is the definition of done; once it passes, v1 ships.

Priors uses Priors. Decisions made during v1 implementation are staged and committed into the project's own `.priors/`. By the time it ships, the dogfood story is the demo.

---

## Contributing

The shortest path:

```bash
git clone https://github.com/claudialnathan/priors.git
cd priors
npm install
npm test
```

Read [`AGENTS.md`](AGENTS.md) before opening a PR. The non-negotiables there are not style preferences; they trace to specific risks identified in the brief and the specs. PRs that violate them will get sent back with a pointer.

If you want to propose a feature that is currently deferred, open an issue rather than a PR. The deferred-item sections in [`docs/project-brief.md`](docs/project-brief.md) are the place to argue for the missing pieces.

---

## License

[MIT](LICENSE) — free to use, modify, and distribute; keep the copyright notice in copies. Copyright © 2026 Claudia Nathan.
