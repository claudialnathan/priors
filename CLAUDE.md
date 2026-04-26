# CLAUDE.md

Claude Code-specific notes for this repo. The durable contract lives in `AGENTS.md` and the docs it points to. Read those first; this file only adds Claude-Code-specific operational detail.

## What this project is

Priors is the project's record of itself: decisions, dead ends, constraints, and open questions stored as structured markdown entries in `.priors/`, exposed over MCP. The persistent subject is the project — not the user, not the AI.

If you are tempted to add user preferences, identity, or psychology to the store, stop. That belongs to a different category of product. See `AGENTS.md` for the framing test.

## Source of truth (read in order)

1. `AGENTS.md` — operating contract. Non-negotiables and surface definitions.
2. `docs/project-brief.md` — positioning. What Priors is and is not.
3. `docs/specs/brief-resource.md` — locked spec for `priors://brief`.
4. `docs/specs/staged-distillation.md` — locked spec for `stage_learning`.

If anything in this file conflicts with the above, the above wins.

## Repo layout (Claude Code orientation)

```text
AGENTS.md                  # the contract (read first)
README.md                  # public-facing intro
SECURITY.md                # safety boundaries
docs/                      # public specs and guides
  project-brief.md
  specs/
    brief-resource.md
    staged-distillation.md
  integrations.md          # MCP client config snippets
  github-workflow.md
  evals.md                 # regression suite docs
src/                       # TypeScript source
  store/                   # entry I/O, index generation
  brief/                   # deterministic brief assembly
  distill/                 # stage_learning verification
  mcp/                     # MCP server, resource and tool handlers
  cli/                     # CLI mirroring MCP surface
  schema/                  # entry/MCP schemas
  util/                    # uuid, yaml, tokens
tests/
  unit/
  regression/              # 7 AGENTS.md eval tasks
  fixtures/
bin/
  priors.js                # executable wrapper (CLI + MCP via subcommand)
.priors/                   # this repo's own dogfooded store (committed)
internal/                  # private working copies of specs (gitignored)
```

The canonical store for any Priors-equipped project lives at `.priors/` **inside that project's repo**. There is no shared `~/.priors` directory. Identity is the UUID in `.priors/project.json`, not the directory path.

## MCP surface (v1)

3 resources, 6 tools. Names and shapes are stable across v1.

Resources:

- `priors://brief`
- `priors://index`
- `priors://entry/{id}`

Tools:

- `recall(query, filters)`
- `get_entry(id)`
- `stage_learning(...)`
- `commit_learning(staged_id)`
- `mark_stale(id, reason)`
- `link_entries(source_id, relation, target_id)`

Prompts (MCP prompt templates):

- `priors_distill` — renders the conservative-archivist system prompt with source content interpolated, used by the calling agent to produce candidates that are then verified by `stage_learning`.

## What is NOT in the v1 surface

These existed in the legacy v0.3 (now tagged `legacy/v0.3.0`) and have been **removed** in v1:

- `priors.init`, `priors.reinforce`, `priors.writeEntry`, `priors.updateEntry`, `priors.discard`
- `priors.emitConstraint`, `priors.applyEmission`, `priors.health`, `priors.export` (export/import return as plain CLI verbs and a different shape)
- Resources: `priors://orientation/head`, `priors://operator`, `priors://state`, `priors://compiled/harness-reminders`, `priors://audit/{id}` (the last one returns under a more limited contract — TBD per spec)
- Activation/decay metadata fields: `activation_score`, `decayed_activation_score`, `activation_state`, `helpful_count`, `decay_half_life_days`, `retrieval_policy`
- The `~/.priors/projects/<repo-id>/` neutral store layout

If you are tempted to reintroduce any of these, see "What never to do" in `AGENTS.md` and "Future considerations" in `docs/project-brief.md`. Most are explicitly deferred to v2+.

## Local development

```bash
npm test              # run the regression suite + unit tests
node bin/priors.js brief --project-root "$PWD"
node bin/priors.js mcp --project-root "$PWD"        # speak MCP over stdio
node bin/priors.js init-config --client claude --project-root "$PWD" --dry-run
```

Node 25+ is required because the runtime imports `.ts` directly via Node's native type stripping. Zero runtime dependencies (this is a hard constraint — see `AGENTS.md`).

## Editing guidance for Claude Code

- Prefer changes in `src/<module>/` and `tests/<unit|regression>/`. Keep modules small and focused.
- Do not add network-dependent runtime packages. Dev-only types are fine.
- Do not reintroduce v0.3 surfaces (decay scoring, reinforce, emit_constraint) without an explicit user request and a new spec doc that supersedes the relevant section.
- When you make a non-trivial implementation choice, stage it: write a `decision` or `failure` entry to `.priors/staged/` (via `stage_learning` or `priors stage`). The repo dogfoods. Don't add stray planning documents.

## Skills/subagents that may help

The handover doc (`internal/claude-code-handover.md`, gitignored) lists user-installed skills that can help during implementation: `using-superpowers`, `writing-plans`, `mcp-builder`, `test-driven-development`, `subagent-driven-development`, `systematic-debugging`, `requesting-code-review`. Invoke them via the standard skill-loading mechanism. They are tools, not authorities — `AGENTS.md` and the specs win.

## Returning to the legacy implementation

```bash
git checkout legacy/v0.3.0
```

The v0.3 MCP server (with decay/reinforce/emit_constraint and `~/.priors` store) is preserved at that tag. It is no longer built or tested on `main`/`reval`.
