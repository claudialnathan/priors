# Priors

> **Persistent project state for autonomous agents.** An append-only log of decisions and constraints that agents write and inherit across context resets.

Most harness memory treats the agent as the protagonist. Priors inverts this: the project's trajectory is primary. Transient agents simply read from and append to a typed log of decisions, constraints, and dead-ends living right in your repository.

The store lives in `.priors/` as plain Markdown, YAML, and JSON. No daemon, no database and no cloud account. You edit it like any other folder, diff it in git and ship it with the code. Fresh sessions inherit the codebase's context without burning tokens to replay history.

Priors tracks what the repo knows about its own history using the MCP wire-up you already have. Reference clients include [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Cursor](https://cursor.com), and the [Codex CLI / OpenAI Agents SDK](https://github.com/openai/openai-agents-python), but any MCP client can read and write the same files.

## Why it exists

**Harness memory belongs to the project, not the agent.** Put memory in a user-shaped bucket and retrieval returns generalized, present-tense preference claims. Under [belief-vs-fact reframing](https://news.stanford.edu/stories/2025/11/ai-language-models-facts-belief-human-understanding-research), accuracy collapses. Priors explicitly stores dated, sourced facts: _as of 2026-04-12 we picked X for reason Y, evidence in commit `abc`._

**Winning answers aren't enough.** Stop at _we chose X_ and you drop the failures, rejected forks, and revisit dates—guaranteeing the next agent will hallucinate its way down the exact same dead end. Priors entries carry a `kind` (`decision`, `failure`, `constraint`, `pattern`, `question`). Agents can pull rejected approaches or stale markers without flooding their context window.

**Forks are trajectory evidence.** If you only log the final output, you're burying the reasoning behind the rejected path. Priors preserves both: `link_entries (source_id, contradiction_of, target_id)` flags them as `contested` so they are retrieved together. Analyze the conflict instead of overwriting it.

## What you get

<table>
<tr>
  <td><b>Context Efficiency</b></td>
  <td><code>priors://brief</code> is bounded, deterministic, and assembled without an LLM. Same store in, same bytes out. It provides IDs and one-line summaries; agents pull full bodies with <code>get_entry</code> only when needed.</td>
</tr>
<tr>
  <td><b>Failures as Data</b></td>
  <td>Dead ends are first-class entries. <code>recall</code> returns them with the underlying reasons attached so agents don't repeat mistakes.</td>
</tr>
<tr>
  <td><b>Staged Promotion</b></td>
  <td><code>stage_learning</code> / <code>priors stage</code> writes candidates to <code>staged/</code> only. Each claim requires a verbatim quote verified by a substring match plus a Dice-coefficient grounding floor. Edit before commit with <code>edit_staged</code>; drop with <code>discard_staged</code>. Promote with <code>commit_learning</code> / <code>priors commit</code>. Nothing auto-lands in <code>entries/</code>.</td>
</tr>
<tr>
  <td><b>Visible Conflict</b></td>
  <td>Contradictions stay in the index. The brief explicitly calls out <code>contested</code> rows for agent review.</td>
</tr>
<tr>
  <td><b>Portable State</b></td>
  <td><code>.priors/</code> is the contract. Export a zip, import elsewhere with <code>--dry-run</code> first. The project's identity is the UUID in <code>project.json</code>, not the folder path.</td>
</tr>
<tr>
  <td><b>Zero Infra</b></td>
  <td>MCP runs when a client starts it; the CLI runs when you run it. Everything else is just files.</td>
</tr>
</table>

## Store layout

```text
.priors/
  project.json          UUID, name, created_at
  config.json           groundingMode (strict|warn), commitThreshold
  entries/              active entries by kind
    decisions/  failures/  constraints/  patterns/  questions/
  staged/               candidates awaiting promotion
  indexes/all.json      regenerated on write
  audit/                append-only logs: actions, distillation-rejects, curation
  exports/              output from `priors export`
  brief.md              from `priors brief`
  log.md                chronological trace
```

The layout is the API. The shipped server and CLI are just one implementation; anything that reads files can participate.

## Install

If you installed from npmjs with the default command (`npm i priors`), run Priors with `npm exec` (or `npx`) because local installs do not expose `priors` on your shell `PATH`.

Local install (matches npmjs install box):

```bash
npm i priors
npm exec priors init
# or: npx priors init
```

Global install (direct `priors` command):

```bash
npm install -g priors
priors init
```

`priors init` scaffolds `.priors/`, mints the project UUID, and prints your MCP config. Example for Claude Code (`mcp.json`):

```json
{
  "mcpServers": {
    "priors": {
      "command": "priors",
      "args": ["mcp", "--project-root", "."]
    }
  }
}
```

Snippets for Cursor and Codex can be found in [`docs/integrations.md`](docs/integrations.md). Or generate them directly:

```bash
priors init-config --client claude
priors init-config --client cursor
priors init-config --client codex
```

From a clone (Node 25+):

```bash
npm install
node bin/priors.js init --project-root .
```

## Commands

<table>
<tr>
  <td colspan="2"><b>Setup</b></td>
</tr>
<tr>
  <td><code>priors init</code></td>
  <td>Scaffold <code>.priors/</code>, mint the project UUID, and print the MCP config snippet.</td>
</tr>
<tr>
  <td colspan="2"><b>Read</b></td>
</tr>
<tr>
  <td><code>priors brief</code></td>
  <td>Print the deterministic orientation document &mdash; IDs and one-line summaries for active entries.</td>
</tr>
<tr>
  <td><code>priors recall --query "rls"</code></td>
  <td>Plain-text search over the index. Combine with <code>--kind</code>, <code>--status</code>, <code>--confidence</code>, <code>--as-of-after</code>, <code>--as-of-before</code>, <code>--limit</code>.</td>
</tr>
<tr>
  <td><code>priors recall --kind failure</code></td>
  <td>Filter by entry kind: <code>decision</code>, <code>failure</code>, <code>constraint</code>, <code>pattern</code>, <code>question</code>, <code>hypothesis</code>.</td>
</tr>
<tr>
  <td><code>priors recall --status contested</code></td>
  <td>Surface entries flagged contested by a <code>contradiction_of</code> link.</td>
</tr>
<tr>
  <td><code>priors get &lt;id&gt;</code></td>
  <td>Show the full body, frontmatter, and incoming edges for one entry.</td>
</tr>
<tr>
  <td><code>priors audit &lt;id&gt;</code></td>
  <td>Show the audit-log slice mentioning an entry id, newest first.</td>
</tr>
<tr>
  <td><code>priors audit curation --since 2026-04-01</code></td>
  <td>Read <code>audit/curation.log</code> for staging and edge-proposal events. Combine with <code>--kind</code> and <code>--source-model</code>.</td>
</tr>
<tr>
  <td><code>priors index</code></td>
  <td>Print <code>indexes/all.json</code> (regenerates if missing).</td>
</tr>
<tr>
  <td colspan="2"><b>Staging lifecycle</b></td>
</tr>
<tr>
  <td><code>priors stage --source-kind transcript --source-ref ./session.log --source-content @./session.log</code></td>
  <td>Verify up to 5 candidate lessons against source content (verbatim substring + Dice-coefficient grounding floor) and write survivors to <code>staged/</code>. Rejects logged to <code>audit/distillation-rejects.log</code>.</td>
</tr>
<tr>
  <td><code>priors edit-staged &lt;staged_id&gt; --claim "..." --confidence medium</code></td>
  <td>Modify a staged candidate before commit. Evidence is immutable; pre- and post-edit payloads are recorded on the curation event.</td>
</tr>
<tr>
  <td><code>priors discard &lt;staged_id&gt; --rationale "duplicate of &lt;id&gt;"</code></td>
  <td>Drop a staged candidate without committing. Original payload preserved on the curation event.</td>
</tr>
<tr>
  <td><code>priors commit &lt;staged_id&gt;</code></td>
  <td>Promote a staged entry to active. Optionally gated by <code>commitThreshold</code> in <code>config.json</code> against the composite quality score.</td>
</tr>
<tr>
  <td colspan="2"><b>Edges &amp; status</b></td>
</tr>
<tr>
  <td><code>priors link &lt;source_id&gt; contradiction_of &lt;target_id&gt;</code></td>
  <td>Direct write of a typed edge. Vocabulary (capped at 8): <code>supersedes</code>, <code>contradiction_of</code>, <code>derived_from</code>, <code>reinforces</code>, <code>caused_by</code>, <code>blocks</code>, <code>depends_on</code>, <code>refutes</code>.</td>
</tr>
<tr>
  <td><code>priors propose-edge &lt;source_id&gt; caused_by &lt;target_id&gt; --rationale "..."</code></td>
  <td>Record an LLM-proposed edge <i>without</i> creating it. Emits a <code>propose_edge</code> curation event only; returns a <code>proposal_id</code>.</td>
</tr>
<tr>
  <td><code>priors commit-edge &lt;proposal_id&gt; &lt;source_id&gt; caused_by &lt;target_id&gt;</code></td>
  <td>Accept a proposed edge. Calls <code>link_entries</code> internally and emits <code>accept_edge</code>.</td>
</tr>
<tr>
  <td><code>priors discard-edge &lt;proposal_id&gt; &lt;source_id&gt; caused_by &lt;target_id&gt;</code></td>
  <td>Drop a proposed edge without creating it. Emits <code>discard_edge</code>.</td>
</tr>
<tr>
  <td><code>priors mark-stale &lt;id&gt; --reason "superseded by newer entry"</code></td>
  <td>Flag an entry as stale &mdash; soft state, distinct from <code>superseded</code>.</td>
</tr>
<tr>
  <td colspan="2"><b>Movement &amp; maintenance</b></td>
</tr>
<tr>
  <td><code>priors export --destination ./export-pack</code></td>
  <td>Write a portable pack of active entries.</td>
</tr>
<tr>
  <td><code>priors import ./export-pack</code></td>
  <td>Read a pack. Dry-run by default; pass <code>--apply</code> to write, <code>--overwrite</code> to replace conflicts.</td>
</tr>
<tr>
  <td><code>priors migrate-relations --dry-run</code></td>
  <td>One-shot rewrite of legacy <code>contradicts</code> relation keys to <code>contradiction_of</code> via raw-YAML manipulation.</td>
</tr>
<tr>
  <td><code>priors health</code></td>
  <td>Run integrity checks across the store; <code>--fix</code> applies safe repairs.</td>
</tr>
<tr>
  <td><code>priors evals</code></td>
  <td>Run the v1 regression suite.</td>
</tr>
<tr>
  <td colspan="2"><b>Server</b></td>
</tr>
<tr>
  <td><code>priors mcp</code></td>
  <td>Start the stdio MCP server for clients.</td>
</tr>
</table>

The CLI exactly matches the MCP tool surface: agents and humans hit the same code paths.

## Entry

One file per entry: YAML frontmatter, markdown body.

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

## Brief

`priors://brief` leverages progressive disclosure. It stays shallow to protect the context window. Agents follow IDs when they need depth.

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

- 8 staged entries awaiting review: run `priors commit <id>` after edits, or remove files under `.priors/staged/` you reject.
```

## Design center

- **Project-scoped records:** Entries describe the codebase and the calls around it, not operator psychology. No `user.json`, no preference blobs, no identity claims.
- **Deterministic brief:** Assembler code only. Two runs on the same store must match byte for byte; tests lock that in.
- **Quote or refuse:** Staging checks every claim against a literal substring of the source and a deterministic Dice-coefficient grounding floor (configurable as strict/warn). Failures log to `audit/distillation-rejects.log`; lifecycle events go to `audit/curation.log`.
- **Stage only:** Distillation never writes straight to `entries/`. Hooks may stage; they may not commit.
- **Conflict stays queryable:** `contested` is a first-class status.
- **Files win:** v1 excludes databases, vector stores, embeddings, background daemons, cloud sync, accounts.
- **Stable IDs:** UUID in `project.json` survives directory renames and moves.
- **Idempotent writes:** MCP tools accept `client_request_id` so retries do not duplicate work.

## v1 boundary

**Ships:** `.priors/` layout (incl. `audit/curation.log` and `config.json`); MCP resources `priors://brief`, `priors://index`, `priors://entry/{id}`, `priors://audit/{id}`; tools `recall`, `get_entry`, `stage_learning`, `edit_staged`, `discard_staged`, `commit_learning`, `mark_stale`, `link_entries`, `propose_edge`, `commit_edge`, `discard_edge`; CLI parity; bounded deterministic brief; quoted staging with Dice-coefficient grounding floor and composite quality score; 8-relation typed edge vocabulary; export/import with dry-run default; client setup docs; seven regression tasks.

**Deferred:** decay or helpful/harmful scores; auto-distillation hooks; `emit_constraint`; shared multi-project store; web UI; semantic search; hosted sync; daemons.

Deferred items are intentionally outside the current package behavior. Feature requests should start with the use case, the proposed surface, and the compatibility risk.

## Docs

| Doc                                                                      | Role                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------- |
| [`docs/integrations.md`](docs/integrations.md)                           | MCP client wiring instructions.                   |
| [`docs/mcp-architecture.md`](docs/mcp-architecture.md)                   | Runtime architecture and CLI/MCP surface details. |
| [`docs/specs/brief-resource.md`](docs/specs/brief-resource.md)           | Rules for `priors://brief` generation.            |
| [`docs/specs/staged-distillation.md`](docs/specs/staged-distillation.md) | Staging, quotes, and verification mechanics.      |
| [`docs/evals.md`](docs/evals.md)                                         | Regression suite layout and scoring.              |

## Status

v1 is active. The specs linked above are locked; the regression suite is the release gate.

## Contributing

```bash
git clone https://github.com/claudialnathan/priors.git
cd priors
npm install
npm test
```

Before opening a PR, run the tests and keep the change scoped. For behavior changes, update the relevant docs and tests in the same PR.

## License

MIT. See [LICENSE](LICENSE).
