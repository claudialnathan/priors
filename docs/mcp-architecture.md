# Priors MCP Architecture

Priors is now MCP-first. The old Claude Code plugin is preserved only in ignored local reference storage, while the runtime contract is the `priors-mcp` stdio server plus `AGENTS.md`.

## Components

- `AGENTS.md`: client-neutral instruction file. It tells agents to use the `priors` MCP server, read orientation resources at session start, and write memory only through MCP tools.
- `bin/priors-mcp.js`: executable wrapper for the server.
- `src/priors-mcp.ts`: dependency-free stdio JSON-RPC MCP implementation.
- `~/.priors/projects/<repo-id>/priors`: canonical neutral store.
- `~/.claude/projects/<slug>/priors`: legacy user store copied once during `priors.init` when present.
- `.reference/`: ignored local folder containing old plugin files and fixtures as migration reference.

## Store

```text
~/.priors/projects/<repo-id>/priors/
  .format-version
  HEAD.md
  operator.yaml
  state.json
  index.json
  contradictions.json
  entries/
  staging/
  emitted/
  audit/
  compiled/
  archive/
```

`entries/` is canonical. `index.json` is derived. `staging/` holds uncommitted proposals. `emitted/` holds reviewed back-pressure artifacts before apply. `audit/events.jsonl` records mutations and rejections.

## MCP Interfaces

Resources:

- `priors://orientation/head`
- `priors://operator`
- `priors://state`
- `priors://index`
- `priors://entry/{id}`
- `priors://compiled/harness-reminders`
- `priors://audit/{id}`

Tools:

- `priors.init`
- `priors.recall`
- `priors.reinforce`
- `priors.writeEntry`
- `priors.updateEntry`
- `priors.discard`
- `priors.distill`
- `priors.verifyProposals`
- `priors.commitProposals`
- `priors.emitConstraint`
- `priors.applyEmission`
- `priors.health`
- `priors.export`

Prompts:

- `priors_init`
- `priors_recall`
- `priors_reinforce`
- `priors_distill`
- `priors_emit_constraint`

Every MCP tool exposes both `inputSchema` and `outputSchema`. Tool calls return `structuredContent` for clients that consume typed output and text content for clients that only render messages.

## Memory Control

Priors keeps read and write paths separate:

- `priors.recall` is a decay-gated read path. It accepts `uncertainty`, `force`, `includeLatent`, and `minActivation` controls. Low-uncertainty calls are skipped unless forced, so agents do not spend tokens on routine local work.
- `priors.reinforce` is the write path for successful use. It raises activation only when `outcome: "helpful"` is paired with `responseSucceeded: true`; unhelpful or contradicted entries lose activation instead.
- `priors.distill` is a trajectory intelligence extractor. It stages compact strategies from failures, recoveries, optimizations, constraints, and decisions rather than preserving raw transcript logs.

Activation is computed with an Ebbinghaus-style half-life from `activation_score`, `last_used_at`, and `decay_half_life_days`. Low activation produces a computed `activation_state: "latent"` in generated indexes and recall results; the entry remains in provenance-preserving storage and can still be reached by direct query or `includeLatent`.

## Safety Boundaries

- Transcript paths must stay inside `projectRoot`.
- Entry/resource IDs must match a narrow safe-id pattern.
- Emissions can only write `.githooks/priors/*`, `scripts/priors/*`, `tests/priors/*`, or `.config/priors/*`.
- Direct `.git/hooks` and `.mcp.json` emission writes are rejected.
- Applying an emission requires `APPLY_PRIORS_EMISSION`.
- Committing low-confidence proposals requires `I_ACCEPT_PRIORS_RISK`.
- Helpful reinforcement requires successful response evidence.
- Config generation pins `process.execPath` and the local `bin/priors-mcp.js` path.

## Bootstrap Configs

Generate configs safely:

```bash
node bin/priors-mcp.js init-config --client claude --project-root "$PWD"
node bin/priors-mcp.js init-config --client cursor --project-root "$PWD"
node bin/priors-mcp.js init-config --client windsurf --project-root "$PWD"
```

Use `--dry-run` to inspect the generated JSON.
