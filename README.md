# Priors

> **Always-on project memory for Claude Code and Cursor.** Priors gives your coding agents a project memory that survives sessions. It records decisions, rejected approaches, constraints, rules, and open questions — then uses them automatically during future work. You interact through `/priors:recall`, `/priors:why`, `/priors:impact`, `/priors:log`, and `/priors:rules`. There is no database to admin, no IDs to type, no terminal CRUD.

Most agent memory treats the agent as the protagonist. Priors inverts this: the **project's** trajectory is primary. Transient agents read from and append to a typed log of decisions, constraints, rules, and dead ends that lives right in your repository as plain Markdown and JSON.

## What it feels like

Install the plugin. Then:

- New session opens — Priors loads a compact orientation brief automatically.
- You ask a question — the agent recalls relevant priors before answering.
- You propose something already tried — the agent pushes back with the rejected approach and recommends an alternative.
- You say _"this is a rule: never commit secrets to public repos"_ — Priors records it as a high-priority rule.
- You say _"log this: we picked X over Y because Z"_ — Priors writes the decision in neutral voice and keeps your phrasing as evidence.
- You ask `/priors:impact` — Priors shows what it caught, what it pushed back on, and what it might have missed.
- You ask `/priors:export md` — Priors hands you a readable snapshot you can paste into a doc.

You never type a UUID. You never manage a queue.

## Two modes

Memory **use** is always on. Memory **writing** changes between modes.

| | **Auto** | **Manual** |
| --- | --- | --- |
| Read brief at session start | yes | yes |
| Recall before non-trivial decisions | yes | yes |
| Push back on rejected approaches | yes | yes |
| Apply active rules | yes | yes |
| Auto-log durable observations at checkpoints | **yes** (with significance gate) | no |
| Direct write on user "log this" | yes | yes |

```
priors mode auto    # the default — auto-log meaningful checkpoints
priors mode manual  # only writes when you explicitly ask
```

Auto-mode is bounded. The significance gate refuses empty / noise / weak-signal candidates.

## Install — Claude Code (recommended)

Priors ships as a Claude Code plugin via a single-plugin marketplace. From any Claude Code session:

```
/plugin marketplace add https://github.com/claudialnathan/priors
/plugin install priors@priors
```

That gives you the slash commands, the `priors-steward` subagent, the lifecycle hooks (SessionStart, UserPromptSubmit, PreCompact, Stop), and the bundled MCP server in one install.

Open a fresh chat in your project. The `SessionStart` hook will create `.priors/` (if it doesn't exist) and load a compact orientation brief.

### Other install paths

- **Local clone**: `/plugin marketplace add /abs/path/to/clone` then `/plugin install priors@priors`. Useful for development.
- **CLI / MCP only** (no slash commands or hooks): `npm i priors` and follow `priors init-config --client claude` to wire just the MCP server. Best when you want Priors in a tool that isn't Claude Code.
- **Cursor**: see ["Install — Cursor"](#install--cursor) below.

The plugin scaffold lives at the repo root: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `skills/<name>/SKILL.md` (one per slash command), `agents/priors-steward.md`, `hooks/hooks.json`, `.mcp.json`.

## Install — Cursor

Cursor reads `.cursor/rules/*.mdc` (always-apply rules) and `.cursor/mcp.json` (MCP servers). Priors ships both:

- `.cursor/rules/priors.mdc` — operating contract surfaced into every chat.
- `.cursor/mcp.json` — MCP server config pointing at the same `bin/priors.js`.

If your Cursor reads `.cursor/mcp.json` from a different location (e.g. `~/.cursor/mcp.json`), copy the entry from `docs/integrations.md`.

## Slash commands

The Claude Code plugin ships these. All slash commands are namespaced as `/priors:<name>` because the plugin name is `priors`.

| Command | What it does |
| --- | --- |
| `/priors:status` | Status: mode, counts, last log, useful next action. |
| `/priors:brief` | Compact deterministic project brief. |
| `/priors:recall <topic>` | Search relevant decisions, failures, constraints, rules, and questions. |
| `/priors:why` | Show which priors and rules influenced this session. |
| `/priors:impact` | Did Priors help this session? Pushbacks, rules applied, candidates proposed. |
| `/priors:reflect` | Drift / appeasement / freshness check across the store. |
| `/priors:log <text>` | Force-log a memory entry. Direct user-authored write. |
| `/priors:rules` | List active rules. |
| `/priors:rule-add <text>` | Add a user-authored rule. High-priority by default. |
| `/priors:export md` / `/priors:export json` | Portable snapshot. |

You can also drive everything from the terminal — see `priors --help` — but the terminal is for `init`, doctor/`health`, `export`, and low-level debugging. Day-to-day flow is in chat.

## Pushback format

When you propose something Priors recognises as a rejected approach, the agent responds in this fixed shape:

```
This approach has been tried and rejected.

On 2026-04-28, we reviewed the human-invoked entry flow and found that
requiring users to retrieve entries by raw UUID made Priors feel like
database admin rather than agent memory, which led to abandonment in
testing.

Relevant prior:
- F-004: UUID-facing retrieval is unacceptable UX

I recommend keeping IDs internal and exposing /recall, /why, /review, and
readable prior references instead.
```

The format is mandatory in the steward subagent and the Cursor rule. You can override — Priors logs the override and `/reflect` flags repeated overrides for review.

## Readable IDs

Human-facing flows show **readable IDs**:

- `D-001` — the first decision.
- `F-004` — the fourth failure.
- `R-002` — the second user-authored rule.

Canonical slug-style IDs (`rule-20260428-r-001`) still exist in metadata, exports, and `--json` output. You don't type them.

When Priors cites a prior, you see:

```
F-004 — Manual UUID retrieval made the UX unusable
Date: 2026-04-28
Consequence: Future agents should avoid human-facing flows that require raw entry IDs.
```

Map between forms with `priors resolve <readable-id-or-id>`.

## How the brief works (nobody hand-writes it)

You log **entries** one at a time — short Markdown files in `.priors/entries/`, written through `/priors:log`, `/priors:rule-add`, or staged-and-promoted from the review queue. Entries carry structured frontmatter (kind, status, claim, date, evidence).

The **brief** is a deterministic *projection* of those entries. The assembler walks the index and renders sections ("Active decisions", "Active constraints", "Open questions", "Recently superseded", "Known dead ends"). No LLM is involved in the brief. Same store in, same bytes out — snapshot tests lock that in.

The trade-off: the brief is template-shaped, not a hand-curated executive summary. That's deliberate. It loads on every session start, drives every downstream agent decision, and must not hallucinate. If you want a session-tailored synthesis, ask the agent to summarise `priors://brief` in chat — the agent's own LLM does the synthesis, the substrate stays trustable.

## What's preserved (the boring, important part)

- **Local-first, file-based.** `.priors/` is the contract. Markdown + YAML for entries, JSON for indexes and audit. No database, no daemon, no cloud, no account.
- **Deterministic brief.** Assembler-only. Same store in, same bytes out.
- **Quote, or refuse.** Agent-proposed candidates pass quote-or-refuse (verbatim substring + Dice-coefficient grounding floor) before they enter the review queue. The user-authored direct-write paths (`/priors:log`, `/priors:rule-add`) bypass the check because the user typed the claim.
- **Append-only audit.** Every write, link, and curation event is logged. `priors audit <id>` and `priors audit curation` are the audit surfaces.
- **Idempotent writes.** Every MCP write tool accepts a `client_request_id`.
- **Failures are first-class.** `recall --kind failure` surfaces them with reasons attached.
- **Stable identity.** The UUID in `.priors/project.json` survives directory rename and moves.

## What changed from the v1 CLI release

The v1 release (still tagged at `legacy/v0.3.0` and `v1.0.0-rc.1`) was CLI-first: users had to type `priors stage --source-content @… --candidates @…` and manage a `staged/` queue. The plugin rework moves the human surface into Claude Code and Cursor:

- Plugin scaffold (`.claude-plugin/`, `skills/`, `agents/`, `hooks/`).
- Two modes (`auto` / `manual`) with a real significance gate.
- New entry kind: `rule`. User-authored rules write directly.
- Readable IDs as the human-facing identifier.
- New surfaces: `/priors:why`, `/priors:impact`, `/priors:reflect`, `/priors:log`, `/priors:rules`, `/priors:rule-add`.
- Natural-language log-intent detection on `UserPromptSubmit`.

What did **not** change: the MCP server, the store layout, the deterministic brief, the quote-or-refuse staging path, the audit log, idempotency keys, the project-as-subject framing, or the seven-task regression suite.

## Store layout

```text
.priors/
  project.json            UUID, name, created_at
  config.json             mode (auto|manual), groundingMode, commitThreshold
  entries/                active entries by kind
    decisions/  failures/  constraints/  patterns/  questions/  rules/
  staged/                 review queue: agent-proposed candidates
  indexes/all.json        regenerated on write (includes readable_id, author, priority)
  audit/
    actions.log           append-only writes
    curation.log          propose / stage / accept / discard
    distillation-rejects.log  quote-or-refuse failures
    session.jsonl         per-session events for /priors:why and /priors:impact
  exports/                output of `priors export`
  brief.md                generated by `priors brief`
```

## CLI

The CLI mirrors the MCP surface and the plugin commands. See `priors --help`. Day-to-day, you don't need it — but it's there for debugging, CI, scripts, and `init`.

## Docs

| Doc | Role |
| --- | --- |
| [`docs/plugin-architecture.md`](docs/plugin-architecture.md) | Plugin/CLI/MCP architecture. |
| [`docs/integrations.md`](docs/integrations.md) | Claude Code / Cursor / Codex install snippets. |
| [`docs/maintainer-guide.md`](docs/maintainer-guide.md) | Non-developer test guide. |
| [`docs/specs/brief-resource.md`](docs/specs/brief-resource.md) | Locked spec for `priors://brief`. |
| [`docs/specs/staged-distillation.md`](docs/specs/staged-distillation.md) | Locked spec for the review-queue path. |
| [`AGENTS.md`](AGENTS.md) | The operating contract for agents. |
| [`CLAUDE.md`](CLAUDE.md) | Claude-Code-specific operational notes. |

## Status

Plugin rework: in progress on `main`. CLI v1 release tagged at `v1.0.0-rc.1`. Legacy v0.3 implementation preserved at `legacy/v0.3.0`.

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
