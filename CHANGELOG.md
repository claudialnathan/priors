# Changelog

All notable changes to **the Priors repo** (CLI, MCP server, plugin scaffold). Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [SemVer](https://semver.org/).

This file is maintained for repo developers. It is **not** shipped with the npm package or the plugin install (excluded from `package.json` `files[]`). Users see the user-facing "What changed" section in `README.md`; this file tracks the per-PR / per-commit detail.

## [Unreleased]

### Layout

- **Slash commands moved from `commands/<name>.md` to `skills/<name>/SKILL.md`** — the modern Claude Code plugin layout per https://code.claude.com/docs/en/plugins. User-visible slash commands are unchanged: all are auto-namespaced as `/priors:<name>` (plugin name `priors` becomes the prefix). The `priors` skill was renamed to `status` so the namespaced form reads `/priors:status` instead of `/priors:priors`.
- **Personal vs. shipped convention.** Anything under `.claude/agents/`, `.claude/skills/`, or `CLAUDE.local.md` is gitignored and treated as per-maintainer dev tooling. The plugin's own published assets live at `agents/`, `skills/`, `hooks/`, `.claude-plugin/`, `.mcp.json` (no leading dot for the plural-noun directories).

### Added

- **Plugin-first surface.** `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `skills/<name>/SKILL.md` (10 slash commands, auto-namespaced as `/priors:<name>` per the modern Claude Code plugin layout), `agents/priors-steward.md`, `hooks/hooks.json`, `hooks/scripts/*.sh`, `.mcp.json` at repo root. Repo is now installable as a single-plugin marketplace via `/plugin marketplace add <url>` + `/plugin install priors@priors`.
- **Cursor support.** `.cursor/rules/priors.mdc` (always-apply rule, encodes pushback format and natural-language log intents) and `.cursor/mcp.json`.
- **Modes.** `mode` field in `.priors/config.json` (`auto` | `manual`). Memory use is always on; memory writing toggles between modes. CLI: `priors mode [auto|manual]`.
- **`rule` entry kind.** Stored under `.priors/entries/rules/`. User-authored rules write directly via `priors rule add`; agent-inferred rules still flow through `stage_learning`.
- **Readable IDs.** `D-001`, `F-004`, `R-002`-style identifiers persisted on `EntryFrontmatter.readable_id`. Allocator at `src/util/readable-id.ts`. Resolver: `priors resolve <readable-id-or-id>`. Canonical slug IDs unchanged.
- **Frontmatter additions** (all optional, backward-compatible): `readable_id`, `author` (`user`|`agent`), `priority` (`high`|`medium`|`low`).
- **Session log.** Append-only `.priors/audit/session.jsonl` with event kinds: `session_start`, `session_end`, `recall`, `pushback`, `rule_applied`, `candidate_proposed`, `candidate_logged`, `candidate_skipped`, `user_log_intent`. Powers `/why`, `/impact`, `/reflect`.
- **Significance gate.** `src/intent/significance.ts` — pure classifier returning `log` / `propose` / `skip`. Gate runs in `userLog` as a safety net even on user-explicit asks.
- **Natural-language log-intent detector.** `src/intent/log-intent.ts` — regex/keyword matcher (no LLM). Runs in the `UserPromptSubmit` hook.
- **Pushback formatter.** `src/intent/pushback.ts` — pure renderer for the canonical "tried and rejected" format. Used by the steward subagent and Cursor rule.
- **Direct-write paths.** `src/rules/rules.ts` (`addUserRule`) and `src/rules/user-log.ts` (`userLog`). Both bypass quote-or-refuse because the user typed the claim; significance gate still runs.
- **`/why` / `/impact` / `/reflect`.** Session-impact reporting (`src/session/impact.ts`) and drift / appeasement / freshness flagging (`src/session/reflect.ts`).
- **CLI subcommands.** `mode`, `status`, `log`, `rules`, `rule add`, `why`, `impact`, `reflect`, `resolve`, `hook`. The `hook` subcommand is the bounded entry point for the Claude Code lifecycle hooks (`session-start`, `user-prompt`, `pre-compact`, `stop`).
- **Docs.** New: `docs/plugin-architecture.md`, `docs/maintainer-guide.md` (non-developer test guide). Rewritten: `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/integrations.md`.
- **Tests.** 46 new unit tests across new modules:
  - `tests/unit/intent/log-intent.test.ts`
  - `tests/unit/intent/significance.test.ts`
  - `tests/unit/intent/pushback.test.ts`
  - `tests/unit/util/readable-id.test.ts`
  - `tests/unit/store/config-mode.test.ts`
  - `tests/unit/rules/rules.test.ts`
  - `tests/unit/session/impact.test.ts`

### Changed

- `package.json` description rewritten to plugin-first positioning.
- `package.json` `files[]` extended to ship plugin scaffold (`.claude-plugin/`, `skills/`, `agents/`, `hooks/`, `.mcp.json`, `.cursor/`) and new docs.
- `.gitignore` no longer ignores `.mcp.json` or `.cursor/` (they ship as part of the plugin).
- `tests/unit/schema/entry.test.ts` — `ENTRY_KINDS` constant now includes `rule`.

### Preserved (deliberately unchanged)

- MCP server and tool surface (`recall`, `get_entry`, `stage_learning`, `edit_staged`, `discard_staged`, `commit_learning`, `mark_stale`, `link_entries`, `propose_edge`, `commit_edge`, `discard_edge`).
- Deterministic `priors://brief` (no LLM in the assembler; byte-identical for identical store state).
- Quote-or-refuse verification (verbatim substring + Dice-coefficient grounding floor) on all agent-proposed candidates.
- Append-only audit logs (`actions.log`, `curation.log`, `distillation-rejects.log`).
- Idempotency keys (`client_request_id`) on every MCP write tool.
- The `.priors/` store layout. New `entries/rules/` directory is additive.
- The seven-task regression suite.

### Deferred / explicitly out of scope

- Team mode, multi-project shared store, accounts.
- Vector store, embeddings, semantic search.
- Cloud sync, daemons, background processes.
- Decay scoring, helpful/harmful counters.

Reintroducing any of these requires a new spec doc and an explicit user request — see "What never to do" in `AGENTS.md`.

---

## [1.0.0-rc.1] — 2026-04-27

CLI-first release candidate. See git log for the per-commit breakdown. Tagged at `v1.0.0-rc.1`. Legacy v0.3 implementation preserved at `legacy/v0.3.0`.
