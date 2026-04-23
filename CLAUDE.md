# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

This is the source repository for **Priors** — a project-scoped harness memory tool built on top of Anthropic's `memory_20250818` tool. Phase 1 scaffold is in place: skill + slash commands + two hooks under `.claude/`. No code has been tested end-to-end against the live memory tool yet. The working directory is not a git repo.

**Positioning:** "the harness is the dataset" — Priors is the structured trajectory dataset that differentiates a project's harness. Not a memory/notes product. This framing is load-bearing for every design decision.

**Primary use case:** handoff artifact across context resets (per Anthropic's harness-design-long-running-apps argument that resets beat in-place compaction for long tasks). Entries must be self-contained enough that a cold-start agent becomes productive by reading the priors only — not by replaying prior conversation history.

Contents:
- `phase-1-spec.md` — the active spec. Read this before proposing anything. Covers file layout under `/memories/priors/`, entry schema (7 types: correction, constraint, pattern, decision, dead-end, operator, open-question), Phase 1 commands, and the two Phase 1 hooks.
- `old-context/` — gitignored reference material (research synthesis, planning notes). Load these when context on the broader memory-tool landscape is needed; do not treat as current spec.
- `notes.md` — scratch file.

## Working on this project

- The spec is the source of truth. When the user asks for design changes, edit `phase-1-spec.md` directly rather than drafting parallel documents.
- Phase 1 scope is deliberately narrow: scaffold + capture + retrieve. Enforcement, compilation, and auto-distillation are Phase 2+. Do not propose features from later phases when working on Phase 1.
- Final project name is TBD — "priors" is the working name. `phase-1-spec.md` §9 lists alternatives.

## Key design choices already made (per spec)

- Directory-backed store under `/memories/priors/`, not a DB.
- YAML for entries, JSON for integrity files (`index.json`, `state.json`), Markdown for orientation/compiled outputs.
- Flat `entries/` directory; type encoded in filename (`<date>-<HHMM>-<type>-<slug>.yaml`).
- `operator.yaml` is a single rolling file (not per-entry) — user context is first-class but not episodic.
- Two Phase 1 hooks: `SessionStart` (registered by default, fires once per cold start) and `UserPromptSubmit` (off by default; opt-in via `/priors-auto-on`, reverts via `/priors-auto-off`). Default posture is zero ambient per-prompt token cost — only user-invoked commands and the one-time cold-start reminder incur load.
- **Back-pressure gate on constraint promotion:** promoting an entry to `constraint` requires an explicit enforcement target (system-reminder, pre-tool-use check, lint rule, or evaluator criterion). Descriptive-only entries tag as `note` and decay. This gate lives in Phase 2 but the schema field exists in Phase 1.
- **Lean-by-default compile.** When Phase 3 lands: no auto-generated CLAUDE.md, no prose inflation, no auto-applied artifacts. Operator context is available via opt-in `UserPromptSubmit` system-reminder injection (off by default; `/priors-auto-on` to enable). Future compiled artifacts emit as reviewable diffs, never auto-write to the repo. Humanlayer's "skill issue" article flagged auto-bloated CLAUDE.mds as an active performance regression — we avoid that class of failure on purpose.
- **Human narrative is compiled, not authored.** The machine-native store is canonical; any human-readable `narrative.md` is regenerated from entries. Never hand-edit the compiled view.
- **Entries are epistemically framed.** Every entry has `valid_from` / `valid_through`. Retrieval treats entries as "as-of" records, not timeless beliefs — protects against the AI Index 2026 belief-vs-fact vulnerability where false-user-belief framing collapses model accuracy.

## Phase roadmap

Phase 1 makes the tool *exist*. Phase 2+ makes it *different*. Do not propose Phase 2+ features when working inside Phase 1 scope, but keep them in mind for forward compatibility of schemas and file layouts.

- **Phase 1 — Capture + retrieve (current scope).** Scaffold `/memories/priors/`, typed entries, `operator.yaml`, two hooks (cold-start view + operator injection), skill commands: `init`, `log`, `state`, `index`, `recall`. `distill` stubbed as propose-only. First E2E surface: `/priors init`.
- **Phase 2 — Curation.** `/priors distill` sub-agent reviews session transcripts, proposes typed entries as a reviewable diff. `/priors promote <id>` moves entries up the tiers (raw → structured → constraint); constraint promotion enforces the back-pressure-target gate. Helpful/contradicted counters start incrementing. Conflict resolution — when new entries contradict old ones, the contradiction becomes a first-class object, not a silent overwrite (ACE grow-and-refine pattern).
- **Phase 3 — Compile.** `/priors compile` regenerates `compiled/harness-reminders.md` (hook-injected) and `compiled/narrative.md` (human view) from the typed store deterministically. Lean-by-default emission (see design choices above). Diffs reviewable before apply.
- **Phase 4 — Enforcement surface.** Constraints emit their enforcement mechanism: pre-tool-use hooks that catch violations at Edit/Write time, system-reminders injected on topic match, optional lint rules. Generator/evaluator split (per Anthropic harness-design): entries can emit evaluator criteria for sprint-contract-style verification.
- **Phase 5 — Portability.** Document the store format so other tools can read/write it. Possible export to a standalone format for cross-project / cross-tool use. Evaluate against LOCOMO / LongMemEval benchmarks.

Open decisions live in `phase-1-spec.md` §9. When those resolve, update this file and the spec together.

## Implementation layout

Phase 1 scaffold lives under `.claude/`:

- `.claude/skills/priors/SKILL.md` — instruction layer the agent loads contextually
- `.claude/commands/priors-init.md` — bootstrap `/memories/priors/` (first E2E surface)
- `.claude/commands/priors-log.md` — force-write a single typed entry
- `.claude/commands/priors-index.md` — regenerate `index.json` from `entries/`
- `.claude/commands/priors-recall.md` — search by tag / type / substring
- `.claude/commands/priors-state.md` — update `state.json` from working tree
- `.claude/commands/priors-distill.md` — Phase 2 stub (do not implement in Phase 1)
- `.claude/commands/priors-auto-on.md` — opt-in: register `UserPromptSubmit` for ambient operator injection
- `.claude/commands/priors-auto-off.md` — revert the opt-in
- `.claude/hooks/session-start.sh` — cold-start orientation reminder
- `.claude/hooks/user-prompt-submit.sh` — operator context injection (script; only runs if hook is registered via `/priors-auto-on`)
- `.claude/settings.local.json` — registers `SessionStart` by default; `UserPromptSubmit` added/removed via the auto-on/off commands

**Untested assumptions to verify before claiming Phase 1 works:**

1. The `memory_20250818` tool is available and enabled in Claude Code sessions run in this repo.
2. The `user-prompt-submit.sh` hook's path resolution (`~/.claude/projects/<slug>/memory/memories/priors/operator.yaml`) matches where Claude Code's memory backend actually persists `/memories/...` files. If Claude Code uses a different path, the hook will silently no-op until `operator.yaml` is found and the path is corrected.
3. `$CLAUDE_PROJECT_DIR` expands correctly in the hook command strings. Fallback: replace with the absolute repo path in the command.

First end-to-end test: fresh Claude Code session in this repo → `/priors-init`. Expect the bootstrap flow to create `/memories/priors/{HEAD.md, index.json, state.json, operator.yaml, entries/.keep, compiled/.keep, archive/.keep}`.
