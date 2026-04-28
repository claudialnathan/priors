# Plugin architecture

This document describes how Priors is wired across the Claude Code plugin surface, the Cursor surface, the bundled MCP server, and the CLI. It supersedes the user-facing parts of `docs/mcp-architecture.md` (which is still accurate as a runtime reference).

## The big picture

Priors ships **one npm package** that contains:

1. The TypeScript implementation (`src/`).
2. The CLI (`bin/priors.js`).
3. The MCP server (started by `priors mcp`).
4. The Claude Code plugin scaffold (`.claude-plugin/`, `skills/`, `agents/`, `hooks/`, `.mcp.json`).
5. The Cursor scaffold (`.cursor/rules/priors.mdc`, `.cursor/mcp.json`).

The plugin commands and hook scripts shell into `node ${CLAUDE_PLUGIN_ROOT}/bin/priors.js …`. The MCP server runs the same binary. The CLI is the same binary. There is no separate "plugin runtime" — everything is one Node process, started on demand.

```
┌──────────────────────────────────────────────────────────┐
│ Claude Code session                                      │
│                                                          │
│   SessionStart hook  ──► priors hook session-start  ──┐  │
│   UserPromptSubmit   ──► priors hook user-prompt    ──┤  │
│   PreCompact / Stop  ──► priors hook pre-compact|stop ┤  │
│   /recall, /log, …   ──► commands shell into CLI    ──┤  │
│                                                       │  │
│   priors-steward subagent ─► CLI / MCP                │  │
│                                                       │  │
│   MCP tool calls   ──► priors mcp (over stdio)      ──┤  │
└──────────────────────────────────────────────────────┼──┘
                                                       ▼
                                              ┌────────────────────┐
                                              │ src/               │
                                              │  store/  brief/    │
                                              │  distill/ recall/  │
                                              │  rules/   intent/  │
                                              │  session/ schema/  │
                                              └─────────┬──────────┘
                                                        ▼
                                              ┌────────────────────┐
                                              │ .priors/           │
                                              │  entries/  staged/ │
                                              │  indexes/  audit/  │
                                              │  config.json       │
                                              └────────────────────┘
```

## Plugin scaffold

```
.claude-plugin/
  plugin.json            # manifest: name, version, author, license
  marketplace.json       # single-plugin marketplace catalog
.mcp.json                # MCP server config (root)
skills/                  # one folder per slash command, auto-namespaced as /priors:<name>
  status/SKILL.md        # /priors:status    — status line
  brief/SKILL.md         # /priors:brief     — deterministic brief
  recall/SKILL.md        # /priors:recall    — search
  why/SKILL.md           # /priors:why       — what was consulted
  impact/SKILL.md        # /priors:impact    — did Priors help this session?
  reflect/SKILL.md       # /priors:reflect   — drift / appeasement / freshness
  log/SKILL.md           # /priors:log       — direct user-authored write
  rules/SKILL.md         # /priors:rules     — list active rules
  rule-add/SKILL.md      # /priors:rule-add  — add user-authored rule
  export/SKILL.md        # /priors:export    — md|json snapshot
agents/
  priors-steward.md      # subagent: pushback + bounded staging at checkpoints
hooks/
  hooks.json             # SessionStart, UserPromptSubmit, PreCompact, Stop
  scripts/
    session-start.sh     # bounded — emits compact brief + mode
    user-prompt.sh       # bounded — detects log intent
    checkpoint.sh        # bounded — records pre-compact / stop checkpoints
```

### Hook contract

Each hook script is bounded and idempotent. None of them call an LLM. They shell into `priors hook <event>`, which:

- writes a session-event line to `.priors/audit/session.jsonl`
- emits at most a small block of context (a brief head, a one-line intent notice, or a checkpoint marker)
- exits cleanly even if `.priors/` does not yet exist (it will run `priors init` once)

The agent surface (the `priors-steward` subagent + the slash commands) does the actual recall, pushback, and review-queue staging. Hooks are deliberately dumb and cheap.

### `${CLAUDE_PLUGIN_ROOT}` vs `${CLAUDE_PROJECT_DIR}`

- `${CLAUDE_PLUGIN_ROOT}` — where the plugin code lives. Used to find `bin/priors.js`.
- `${CLAUDE_PROJECT_DIR}` — the user's project. Used as `--project-root` for the CLI so `.priors/` ends up in the user's repo.

Hook scripts fall back to `${PWD}` if `${CLAUDE_PROJECT_DIR}` is unset.

## Cursor scaffold

```
.cursor/
  rules/
    priors.mdc           # always-apply operating rule (pushback, intents, cost)
  mcp.json               # MCP server config for Cursor
```

Cursor doesn't (currently) have a plugin surface equivalent to Claude Code's. The `.cursor/rules/priors.mdc` file plays the role of the steward subagent: every Cursor chat in this project surfaces the rule. The `.cursor/mcp.json` wires the same MCP server. Slash commands map to typing the same intent in chat (Cursor will recognise them through the rule).

## CLI surface

The CLI keeps full parity with the MCP tool set so agents and humans hit the same code paths. The CLI plus the plugin together implement the full Priors surface:

- **Setup / lifecycle**: `init`, `init-config`, `mode`, `status`.
- **Read**: `brief`, `recall`, `get`, `index`, `audit`.
- **Direct writes (user-authored)**: `log`, `rule add`.
- **Review queue (agent-proposed)**: `stage`, `edit-staged`, `discard`, `commit`.
- **Edges**: `link`, `propose-edge`, `commit-edge`, `discard-edge`, `mark-stale`.
- **Sessions**: `why`, `impact`, `reflect`, `resolve`, `hook`.
- **Movement**: `export`, `import`, `migrate-relations`, `health`, `evals`.
- **Server**: `mcp`.

Everything has a `--project-root` flag (defaults to cwd) and a `--json` flag.

## Modes

`config.json` carries `mode` alongside `groundingMode` and `commitThreshold`:

```json
{
  "mode": "auto",
  "groundingMode": "strict",
  "commitThreshold": 0.0
}
```

`mode` controls writing behavior only. Reading is always on.

- `auto` — agents may stage candidates at meaningful checkpoints, gated by `src/intent/significance.ts`. Direct writes still require explicit user ask.
- `manual` — agents only write when the user explicitly asks via `/priors:log` or `/priors:rule-add`.

Switching modes is a one-line config change: `priors mode auto|manual`.

## Readable IDs

Each entry carries an optional `readable_id` (`D-001`, `F-004`, `R-002`) in addition to its canonical slug ID. The allocator (`src/util/readable-id.ts`) is a pure function over already-issued readable IDs of the same kind.

The plugin commands and the agents emit readable IDs in human-facing output. The MCP `recall` tool, `--json` CLI output, and `priors export` continue to use canonical IDs because they are machine-consumed.

`priors resolve <id>` maps either form back to canonical.

## Significance gate

`src/intent/significance.ts` is a pure classifier returning `log` / `propose` / `skip`.

- `log` is reserved for user-explicit asks and user-authored rules.
- `propose` is the auto-mode default for candidates with strong signals — these go to the review queue (the safe `stage_learning` path).
- `skip` drops everything else.

The gate is invoked from `userLog` (as a safety net even on user-explicit asks) and is intended to be invoked from the steward at checkpoints. Hooks themselves do not run the gate — they emit checkpoint markers and let the agent surface decide.

## Natural-language intent

`src/intent/log-intent.ts` is a regex/keyword matcher — no LLM. It returns the matched trigger phrase, a suggested kind (`rule` / `failure` / `constraint` / `decision` / `question` / `note`), a strength (`high` / `medium`), and a `ruleAssertion` flag.

The `UserPromptSubmit` hook calls `priors hook user-prompt`, which detects intent and writes a `user_log_intent` event to the session log. The agent (or the `/log` slash command) sees the surfaced one-liner and decides whether to write.

## Pushback formatter

`src/intent/pushback.ts` exports `formatPushback` and `formatEntryReference`. Pure functions. The steward subagent uses them to render the canonical pushback shape; tests guard against drift.

## Session log

`.priors/audit/session.jsonl` is append-only. Each line is a `SessionEvent` with `ts`, `session_id`, `kind`, and a free-form payload. The session log is what `/why`, `/impact`, and `/reflect` read.

Event kinds: `session_start`, `session_end`, `recall`, `pushback`, `rule_applied`, `candidate_proposed`, `candidate_logged`, `candidate_skipped`, `user_log_intent`.

The log lives next to the existing append-only logs (`actions.log`, `curation.log`, `distillation-rejects.log`) so it benefits from the same backup and audit hygiene.

## What's preserved from v1 (unchanged)

- `priors://brief` is still deterministic, still bounded, still byte-identical for identical store state.
- `stage_learning` still runs quote-or-refuse plus the Dice-coefficient grounding floor. No fast path.
- Every MCP write tool still accepts a `client_request_id` for idempotency.
- The store is still local files, no database, no daemon, no cloud.
- The eight-relation typed-edge vocabulary is unchanged.
- The seven-task regression suite is unchanged.

## What changed

- New entry kind `rule`. Stored under `entries/rules/`.
- New optional frontmatter fields: `readable_id`, `author` (`user` | `agent`), `priority` (`high` | `medium` | `low`).
- New config key `mode` (`auto` | `manual`).
- New CLI subcommands: `mode`, `status`, `log`, `rules`, `rule add`, `why`, `impact`, `reflect`, `resolve`, `hook`.
- New modules: `src/intent/`, `src/session/`, `src/rules/`, `src/util/readable-id.ts`.
- New plugin scaffold and Cursor scaffold at repo root.
