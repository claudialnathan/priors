# CLAUDE.md

This repo contains **Priors** — a project-scoped harness memory tool that ships as a Claude Code plugin.

## What it does

Priors gives a Claude Code project a typed, file-backed trajectory dataset — a structured record of decisions, constraints, patterns, and dead-ends that persists across context resets. The primary use case is cold-start handoff: a fresh agent reads the priors store and becomes productive without replaying conversation history.

## Store location

The store lives outside the user's repo, at a project-scoped path under Claude Code's own per-project data directory:

```
~/.claude/projects/<slug>/priors/
```

where `<slug>` is cwd with `/` replaced by `-`. This keeps `git status` clean and coexists alongside Claude Code's session logs and auto-memory for the same project.

## Plugin layout

The repo itself is the plugin. Standard Claude Code plugin structure:

```
.claude-plugin/
  plugin.json                     # manifest (name: priors, version, author)
skills/
  priors/
    SKILL.md                      # instruction layer, loaded contextually
    schemas/                      # 7 entry schemas (reference material)
commands/
  init.md                         # /priors:init      — bootstrap (dispatches existing vs fresh; no operator interview)
  log.md                          # /priors:log       — force-write a typed entry
  index.md                        # /priors:index     — regenerate index.json
  recall.md                       # /priors:recall    — search by tag/type/substring
  state.md                        # /priors:state     — sync state.json to working tree
  health.md                       # /priors:health    — audit store for stale/dupe entries
  distill.md                      # /priors:distill   — Phase 2 stub (transcript → candidate entries)
  reconcile.md                    # /priors:reconcile — Phase 2 stub (drift detection via inferred_signals_hash)
  auto-on.md                      # /priors:auto-on   — flip runtime flag for operator inject
  auto-off.md                     # /priors:auto-off  — revert
hooks/
  hooks.json                      # hook registrations (SessionStart, UserPromptSubmit)
  session-start.sh                # cold-start orientation reminder
  user-prompt-submit.sh           # operator context injection (gated by .auto-on flag)
lib/
  init/
    detect-stack.sh               # stack + package manager + TS strict + monorepo signals
    detect-ci.sh                  # CI provider + test framework + e2e framework
    detect-back-pressure.sh       # enforcement points (hook/lint/format/typecheck/ci)
    inferred-signals-hash.sh      # SHA256 of canonical inference inputs — drift-detection primitive
docs/
  onboarding-design.md            # why /priors:init looks the way it does
tests/
  contract/test-hooks.sh          # 32-assertion hook audit
  fixtures/existing-nextjs-ts/    # Flow A fixture
  fixtures/fresh-empty/           # Flow B fixture
```

Commands run via Claude Code's native Read / Write / Edit / Bash tools. No `memory_20250818` tool, no SDK dependency.

## Key design choices

- **Plugin format, not standalone config** — installable via `/plugin install` or `claude --plugin-dir`. Namespaced slash commands (`/priors:init`). Nothing in the user's repo.
- **Store lives outside the repo** — `~/.claude/projects/<slug>/priors/`. `git status` stays clean.
- **Zero ambient cost by default** — `UserPromptSubmit` hook is registered but silent; `/priors:auto-on` touches a `.auto-on` flag in the store that the hook checks before emitting. `SessionStart` fires once per session.
- **Epistemically framed entries** — every entry has `valid_from` / `valid_through`; retrieval treats them as as-of records, not timeless beliefs.
- **Lean compile** — no auto-generated CLAUDE.md, no auto-writes. Compiled artifacts (Phase 3) will emit as reviewable diffs.

## Local development

Iterate against the repo as a live plugin:

```bash
claude --plugin-dir .
```

That loads the plugin from cwd — hooks fire, commands are available as `/priors:*`. After editing any skill / command / hook, run `/reload-plugins` in the Claude Code session to pick up changes without restart.

## Testing

One contract test — `make test` runs `tests/contract/test-hooks.sh`, which audits the plugin manifest, the hooks registration, and both hook scripts (silent-failure guard, correct path, correct output shape, auto-on flag gating, 5-preference cap). 32 assertions.

## Phase status

Phase 1 (capture + retrieve) ships as a Claude Code plugin. Phases 2–5 are specced in `internal/` but not implemented.
