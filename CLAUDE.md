# CLAUDE.md

Claude Code-specific notes for this repo. The durable contract lives in `AGENTS.md` and the docs it points to. Read those first; this file only adds Claude-Code-specific operational detail.

## What this project is

Priors is always-on project memory for Claude Code (and Cursor). The same npm package ships both the CLI and the plugin. When installed in Claude Code, Priors:

- loads a compact orientation brief at `SessionStart`
- detects natural-language log intent on `UserPromptSubmit`
- records checkpoints on `PreCompact` and `Stop`
- runs an MCP server bundled with the plugin
- exposes slash commands (auto-namespaced as `/priors:<name>`): `/priors:status`, `/priors:brief`, `/priors:recall`, `/priors:why`, `/priors:impact`, `/priors:reflect`, `/priors:log`, `/priors:rules`, `/priors:rule-add`, `/priors:export`
- ships a `priors-steward` subagent for pushback and review-queue staging

The persistent subject is the **project** — not the user, not the AI.

## Source of truth (read in order)

1. `AGENTS.md` — operating contract (modes, non-negotiables, surfaces).
2. `docs/plugin-architecture.md` — plugin/CLI/MCP wiring.
3. `docs/specs/brief-resource.md` — locked spec for `priors://brief`.
4. `docs/specs/staged-distillation.md` — locked spec for `stage_learning` (the review-queue path).

## Repo layout

```text
.claude-plugin/plugin.json     # plugin manifest
.mcp.json                      # MCP server config (plugin form, root)
skills/<name>/SKILL.md         # one per slash command (auto-namespaced as /priors:<name>)
agents/priors-steward.md       # the steward subagent
hooks/hooks.json               # SessionStart, UserPromptSubmit, PreCompact, Stop
hooks/scripts/                 # bounded shell scripts called by hooks
.cursor/rules/priors.mdc       # Cursor-side always-apply rule
.cursor/mcp.json               # Cursor MCP server config
bin/priors.js                  # CLI + MCP via subcommand
src/                           # TypeScript implementation
  store/                       # entry I/O, index, config (mode), audit, paths
  brief/                       # deterministic brief assembly
  distill/                     # stage_learning verification (quote-or-refuse)
  curation/                    # edits, edges, mark-stale
  recall/                      # search over the index
  rules/                       # user-authored rule + /priors:log direct write
  intent/                      # log-intent detector, significance gate, pushback formatter
  session/                     # session log, /impact, /reflect
  schema/                      # frontmatter + MCP input/output schemas
  util/                        # uuid, yaml, tokens, readable-id allocator
tests/
  unit/                        # per-module unit tests
  regression/                  # the seven AGENTS.md eval tasks
  snapshots/                   # brief-determinism guard
docs/
  plugin-architecture.md       # this is the new architectural overview
  integrations.md              # Cursor / Claude Code / Codex install snippets
  mcp-architecture.md          # legacy CLI/MCP runtime details (still accurate)
  evals.md
  specs/
    brief-resource.md
    staged-distillation.md
.priors/                       # this repo dogfoods Priors (gitignored — not committed)
```

The store at `.priors/` belongs to the host project. When Priors is installed in another repo, `.priors/` lives in *that* repo. There is no shared `~/.priors`.

## Plugin / CLI surface (Claude Code orientation)

The plugin is the same npm package. Slash commands shell into `node ${CLAUDE_PLUGIN_ROOT}/bin/priors.js …` rather than depending on a global install. Hooks pass `${CLAUDE_PROJECT_DIR}` (falls back to `$PWD`) so the store lands in the user's project, not the plugin's directory.

Useful surfaces while developing:

```bash
npm test                                                     # unit + regression + snapshots
node bin/priors.js status --project-root .                   # mode + counts + last entry
node bin/priors.js mode auto                                 # toggle write mode
node bin/priors.js log "<claim>" --kind decision             # direct user-authored write
node bin/priors.js rule add "<rule>" --priority high         # direct user-authored rule
node bin/priors.js recall --query "<topic>" --limit 8        # search the index
node bin/priors.js why                                       # what's been consulted this session
node bin/priors.js impact                                    # session-impact report
node bin/priors.js reflect                                   # drift / freshness flags
node bin/priors.js mcp --project-root .                      # speak MCP over stdio
```

Node 25+ is required because the runtime imports `.ts` directly via Node's native type stripping. Zero runtime dependencies (hard constraint).

## Editing guidance for Claude Code

- Prefer changes in `src/<module>/` and `tests/<unit|regression>/`.
- Slash commands live as `skills/<name>/SKILL.md`. Keep them short — they're prompt scaffolds, not implementation. Plugin name (`priors`) auto-namespaces them as `/priors:<name>`.

### Personal vs shipped — gitignore convention

When working on the Priors plugin itself, you'll often want personal subagents, skills, or notes that don't ship to plugin users. The convention:

| Concern | Personal (gitignored) | Shipped (tracked) |
| --- | --- | --- |
| Project memory | `CLAUDE.local.md` | `CLAUDE.md` |
| Subagents | `.claude/agents/<name>.md` | `agents/priors-steward.md` |
| Skills / slash commands | `.claude/skills/<name>/SKILL.md` | `skills/<name>/SKILL.md` |
| Settings | `.claude/settings.local.json` | `.claude-plugin/plugin.json` |
| Cursor rules | `.cursor/rules.local/<name>.mdc` | `.cursor/rules/priors.mdc` |

The leading dot (`.claude/...`) means "personal Claude Code config for this repo." No leading dot (`agents/`, `skills/`) means "the plugin's own published asset."
- Hook scripts in `hooks/scripts/` must be bounded. They run on every session start, every prompt, and at every compact/stop. Cost discipline is non-optional.
- The `priors hook <event>` CLI is the cheap, deterministic surface that hooks should call. Do not embed agent prompts inside hook scripts.
- When you make a non-trivial implementation choice, log it: `priors log "<choice>" --kind decision --rationale "<why>"`. The repo dogfoods.

## What changed in the plugin rework (2026-04-28)

- Added `rule` as an entry kind. Rules can be user-authored (direct write) or agent-proposed (review queue).
- Added `mode` to `.priors/config.json` — `auto` (with significance gate) and `manual`.
- Added readable IDs (`D-001`, `F-004`, `R-002`) on top of canonical slug IDs. Human-facing UX shows readable; canonical persists in metadata, JSON, and exports.
- Added the plugin scaffold (`.claude-plugin/`, `skills/`, `agents/`, `hooks/`, `.mcp.json`).
- Added Cursor compatibility (`.cursor/rules/priors.mdc`, `.cursor/mcp.json`).
- Added `src/intent/` (log-intent detector, significance gate, pushback formatter).
- Added `src/session/` (session log, /impact, /reflect).
- Added `src/rules/` (`addUserRule`, `userLog`, `listRules`).
- Added new CLI subcommands: `mode`, `status`, `log`, `rules`, `rule add`, `why`, `impact`, `reflect`, `resolve`, `hook`.

What did **not** change: MCP server, deterministic brief, append-only audit, quote-or-refuse, idempotency keys, project-as-subject, the `.priors/` layout, the seven-task regression suite, the staging path for agent-proposed candidates.

## Returning to the legacy implementation

```bash
git checkout legacy/v0.3.0
```

The pre-rework MCP server (with `~/.priors`, decay scoring, `priors.reinforce`, `priors.emitConstraint`) is preserved at that tag. It is no longer built or tested on `main`.
