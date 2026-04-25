# priors

> A project's trajectory becomes legible to future agents as causality, not as retrieval.

Priors is an MCP-first, project-scoped harness memory system for autonomous coding agents. It keeps a typed record of decisions, corrections, constraints, dead-ends, patterns, and open questions so a fresh agent can inherit project shape without replaying conversation history.

The canonical store is vendor-neutral and lives outside the repo:

```text
~/.priors/projects/<repo-id>/priors/
```

The old Claude Code plugin was moved into the ignored `.reference/` folder as local migration context. The tracked product architecture is now the standalone `priors-mcp` stdio server plus the `AGENTS.md` open instruction file.

## Why MCP

Priors is trajectory-primary: agents come and go, but the project sediment persists. MCP makes that sediment available to Claude Code, Cursor, Windsurf, Codex/OpenAI Agents SDK, and any other compliant client without binding the memory format to one vendor's plugin model.

The memory model is intentionally not flat RAG. Priors treats a transcript as trajectory evidence and stores only compact, actionable strategies: failures, recoveries, optimizations, constraints, decisions, and open questions with provenance. Recall is a gated read path, while reinforcement is an explicit write path after an entry actually helps a successful response.

`AGENTS.md` carries the client-neutral instruction contract:

- use the `priors` MCP server;
- read orientation resources at session start;
- recall relevant priors when uncertainty is material;
- reinforce only entries that actively helped a successful response;
- write durable memory only through Priors MCP tools;
- never edit `~/.priors` directly.

## Install

Use a current Node runtime. This repo intentionally has no runtime package dependencies; the MCP server speaks stdio JSON-RPC directly.

```bash
npm test
node bin/priors-mcp.js --version
```

During local development, run the server directly:

```bash
node bin/priors-mcp.js --project-root "$PWD"
```

Generate client config with pinned local paths:

```bash
node bin/priors-mcp.js init-config --client claude --project-root "$PWD"
node bin/priors-mcp.js init-config --client cursor --project-root "$PWD"
node bin/priors-mcp.js init-config --client windsurf --project-root "$PWD"
```

Use `--dry-run` to preview without writing.

See `docs/mcp-architecture.md` for the implementation architecture and bootstrap config contract.

## MCP surface

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

## Store layout

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

The format remains plain YAML, JSON, and Markdown. `entries/` is canonical; `index.json` is regenerated. `staging/` holds distillation proposals before verification/commit. `audit/events.jsonl` records every write, verification, emission, rejection, and export.

If a legacy Claude Code store exists at `~/.claude/projects/<slug>/priors`, `priors.init` copies it into the neutral store once and records the migration.

## Memory and curation

Entries are typed: `correction`, `decision`, `dead-end`, `pattern`, `constraint`, `operator`, and `open-question`.

Every committed entry carries decay and retrieval metadata:

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

Retrieval is decay-gated and typed/tag/path-first in v1. Callers pass an uncertainty signal; low-uncertainty recall is skipped unless forced, and latent entries stay out of broad retrieval unless they directly match the query or the caller opts into `includeLatent`. Semantic graph links are structural fields, not an embeddings dependency.

Reinforcement is decoupled from recall. `priors.reinforce` only raises activation when a retrieved entry actively contributed to a successful response. Unhelpful or contradicted entries lose activation instead of being deleted, allowing rarely useful memories to decay into a latent state while preserving provenance.

Distillation is staged and verified:

1. `priors.distill` writes proposals to `staging/`.
2. Every proposal includes evidence references, trajectory attribution, and a self-critique.
3. `priors.verifyProposals` checks schema validity, actionability, transcript support, duplicate risk, contradiction risk, and path provenance.
4. `priors.commitProposals` commits proposals above threshold. Low-confidence commits require the explicit risk token.

## Back-pressure

`priors.emitConstraint` creates reviewable artifacts only. `priors.applyEmission` requires an approval token and can write only allowlisted paths:

- `.githooks/priors/*`
- `scripts/priors/*`
- `tests/priors/*`
- `.config/priors/*`

It rejects arbitrary `.mcp.json` writes, direct `.git/hooks` writes, path traversal, and non-allowlisted emission targets.

## Security posture

- Perception: validate tool inputs and reject path traversal.
- Planning: classify write/emission tools as approval-gated.
- Action: avoid shell interpolation; use filesystem APIs and fixed command shapes.
- Memory: append JSONL audit records for writes, verification, emissions, and rejections.
- Bootstrap configs pin the local Node executable and local `bin/priors-mcp.js`; generated configs do not rely on `npx -y`.

## Tests

```bash
make test
```

The suite covers:

- MCP protocol discovery: `initialize`, `tools/list`, `resources/list`, `resources/read`, `prompts/list`;
- MCP tool input and output schemas, plus structured tool results;
- store initialization under `~/.priors`;
- entry validation, commit, index regeneration, and recall;
- decay-gated recall and successful-use reinforcement;
- distill proposal staging and verification;
- low-confidence commit rejection;
- emission allowlists and approval tokens;
- config generation with pinned local executable paths.

## Reference Material

The historical Claude Code plugin files, old slash-command prompts, hook scripts, old init helpers, old hook tests, and fixture scaffolding are kept locally under:

```text
.reference/
```

That folder is git ignored. It is reference-only and not part of the active repository surface.

## The test

A fresh agent given only a project's Priors store should predict what the project accepts or rejects on held-out proposals. Project shape inherited; trajectory legibility is the measure.
