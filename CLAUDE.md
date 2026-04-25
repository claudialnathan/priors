# CLAUDE.md

This repo contains **Priors**: an MCP-first, project-scoped harness memory tool.

## Current architecture

Priors now ships primarily as a standalone stdio MCP server:

```text
bin/priors-mcp.js        # executable wrapper
src/priors-mcp.ts        # dependency-free MCP server/runtime
AGENTS.md                # client-neutral agent instructions
```

The canonical store lives outside user repos:

```text
~/.priors/projects/<repo-id>/priors/
```

The old Claude Code plugin files were moved into ignored local reference storage:

```text
.reference/
```

Do not depend on `.reference/` for active behavior or tests. It exists only to preserve migration context locally.

## MCP behavior

The server speaks line-delimited JSON-RPC over stdio and implements the MCP surfaces directly, without an SDK dependency.

Primary tools:

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

Primary resources:

- `priors://orientation/head`
- `priors://operator`
- `priors://state`
- `priors://index`
- `priors://entry/{id}`
- `priors://compiled/harness-reminders`
- `priors://audit/{id}`

Primary prompts:

- `priors_init`
- `priors_recall`
- `priors_reinforce`
- `priors_distill`
- `priors_emit_constraint`

## Store contract

The store remains plain files: YAML entries, JSON indexes/state/audit, Markdown orientation/compiled views.

New MCP-first directories:

```text
staging/     # distill/write proposals before commit
audit/       # JSONL audit trail
emitted/     # reviewed emission artifacts before apply
```

Entries include activation/decay metadata:

- `activation_score`
- `decayed_activation_score` in generated indexes and recall results
- `activation_state` in generated indexes and recall results
- `last_used_at`
- `helpful_count`
- `decay_half_life_days`
- `retrieval_policy`
- `links`
- `supersedes`
- `superseded_by`
- `contradiction_of`

Recall is gated by uncertainty and decayed activation. Reinforcement is explicit: only call `priors.reinforce` for entries that actively helped a successful response. Distillation should extract failures, recoveries, optimizations, constraints, and decisions, not generic transcript facts.

## Security constraints

- Reject path traversal for resources, transcript paths, and emitted artifacts.
- Do not write `.git/hooks` directly.
- Do not write `.mcp.json` through emission tools.
- `priors.applyEmission` requires `APPLY_PRIORS_EMISSION`.
- Low-confidence proposal commits require `I_ACCEPT_PRIORS_RISK`.
- `init-config` pins the local Node executable plus local `bin/priors-mcp.js`; do not generate `npx -y` configs.

## Local development

Run tests:

```bash
make test
```

Run only MCP tests:

```bash
npm test
```

Run the server:

```bash
node bin/priors-mcp.js --project-root "$PWD"
```

Preview client config:

```bash
node bin/priors-mcp.js init-config --client claude --project-root "$PWD" --dry-run
```

## Editing guidance

- Prefer changes in `src/priors-mcp.ts` and `tests/mcp/run-tests.mjs` for MCP behavior.
- Do not reintroduce active Claude plugin files unless the user explicitly asks for a compatibility adapter.
- Do not add network-dependent runtime packages unless the user explicitly accepts that dependency.
- The runtime currently requires Node 25 because it imports `.ts` directly through Node's native type stripping.
