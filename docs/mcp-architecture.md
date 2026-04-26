# Priors MCP Architecture (v1)

Priors v1 is an MCP-first local tool. The MCP server and the CLI both call into the same store/logic; whichever surface you change, change the other.

For positioning, see [`project-brief.md`](project-brief.md). For the locked surface specs, see [`specs/brief-resource.md`](specs/brief-resource.md) and [`specs/staged-distillation.md`](specs/staged-distillation.md). For the operating contract, see `../AGENTS.md`.

## Components

| Component | Path | Responsibility |
|---|---|---|
| Store | `src/store/` | Read/write entries; regenerate `indexes/all.json`; append audit. |
| Brief | `src/brief/` | Deterministic assembly of `priors://brief`. No LLM call inside. |
| Distill | `src/distill/` | Verifies `stage_learning` candidates against source via verbatim quote substring matching. |
| Schema | `src/schema/` | Entry schema + MCP input/output JSON Schemas (all `additionalProperties: false`). |
| MCP server | `src/mcp/` | stdio JSON-RPC; resources, tools, prompts. |
| CLI | `src/cli/` | One-to-one mirror of MCP surface. |
| Util | `src/util/` | UUID, YAML frontmatter parse/serialize, token counting, safe-path validation. |
| Bin | `bin/priors.js` | Single executable that dispatches to CLI subcommands or speaks MCP via `priors mcp`. |

## Store

Priors stores its state in `<project-root>/.priors/`:

```text
.priors/
  project.json          # { id (UUID), name, created_at }
  entries/
    decisions/
    failures/
    constraints/
    patterns/
    questions/
    hypotheses/
  staged/               # candidate entries awaiting user approval
  indexes/
    all.json            # regenerated on every write
  audit/
    actions.log         # JSONL: writes, links, marks, imports
    distillation-rejects.log  # candidates that failed verification
  exports/
  brief.md              # written by `priors brief`
  log.md                # chronological state
```

`entries/` is canonical. `indexes/all.json` is derived. Identity is the UUID in `project.json` — the directory path is incidental, and tests verify identity survives directory rename.

## MCP surface

### Resources

- `priors://brief` — bounded markdown orientation document. Always assembled fresh from `indexes/all.json`. ≤ 2,000 tokens. See [`specs/brief-resource.md`](specs/brief-resource.md).
- `priors://index` — full `indexes/all.json` content (JSON).
- `priors://entry/{id}` — full entry body + frontmatter for the entry with that ID. Resolved through the index, not the file path.

### Tools

| Tool | Input | Output |
|---|---|---|
| `recall` | `query`, optional `kind`/`status`/`confidence`/`as_of_after`/`as_of_before`/`relation`/`limit` | `{ matches: [{ id, kind, claim, status, confidence, as_of, updated_at }] }` |
| `get_entry` | `id` | `{ entry: <full entry> }` |
| `stage_learning` | `source_kind`, `source_ref`, `source_content`, `project_id`, optional `candidates`, `existing_entries`, `prompt_context`, `client_request_id` | If `candidates` omitted: `{ prompt: <rendered system prompt>, instruction: "produce candidates and call back" }`. If provided: `{ staged: [...], rejected: [...], audit_id }`. |
| `commit_learning` | `staged_id`, `client_request_id` | `{ entry_id, audit_id }` |
| `mark_stale` | `id`, `reason`, `client_request_id` | `{ entry_id, audit_id }` |
| `link_entries` | `source_id`, `relation` (`supersedes`/`contradicts`/`reinforces`/`derived_from`), `target_id`, `client_request_id` | `{ source_id, target_id, relation, audit_id }` |

Every tool input schema has `additionalProperties: false`. Every tool returns both `structuredContent` and a textual `content[0].text` rendering for clients that don't consume typed output.

### Prompts

- `priors_distill` — renders the conservative-archivist system prompt from `docs/specs/staged-distillation.md` with the source content interpolated. The calling agent's model produces JSON candidates; the agent then calls `stage_learning` with those candidates for verification.

## Verification: stage_learning in detail

`stage_learning` is the riskiest correctness surface. It enforces "quote, or refuse" deterministically:

1. **Schema validation** — candidate JSON must conform to the schema in `docs/specs/staged-distillation.md`.
2. **Quote presence** — every `evidence.quote` must appear verbatim in `source_content` (case-sensitive, whitespace-tolerant). Failures drop the candidate.
3. **Forbidden kinds** — any candidate that targets user preference, identity, or psychology is dropped.
4. **Length bounds** — `claim` ≤ 280 chars, `reasoning` ≤ 600 chars, `evidence` between 1 and 5 quotes per candidate.
5. **Confidence sanity** — high confidence candidates must have substring overlap between the strongest quote and the claim.
6. **Deduplication** — claims >80% similar to an active entry's claim convert to a `relations.reinforces` link rather than a new candidate.

Dropped candidates are appended to `audit/distillation-rejects.log` with the rejection reason. Verified candidates are written to `staged/` as YAML+markdown files.

## Determinism: the brief

`priors://brief` is assembled, never generated. Two runs against the same store produce byte-identical output.

- The assembler reads `indexes/all.json` and applies the per-section ranking rules in [`specs/brief-resource.md`](specs/brief-resource.md#assembly-logic).
- Each section has a token budget. If a section overflows, items are dropped per the spec's overflow policy. The brief never globally re-truncates.
- Tokens are counted with a simple character-based approximation (`ceil(chars / 4)` for English). This is conservative and dependency-free; the v1 store doesn't depend on a tokenizer library. See `src/util/tokens.ts` and the constraint entry in `.priors/entries/constraints/`.

## Idempotency

Every write tool accepts an optional `client_request_id`. The MCP server keeps a small replay cache (`audit/idempotency.json`, capped) keyed by `(tool, client_request_id)`. A repeated request with a known ID returns the cached response instead of writing again.

## CLI

The CLI mirrors the MCP surface one-to-one:

| CLI | MCP |
|---|---|
| `priors init` | (one-off; sets up `.priors/`) |
| `priors brief` | `resources/read priors://brief` |
| `priors recall <query>` | `tools/call recall` |
| `priors entry <id>` | `tools/call get_entry` |
| `priors stage` | `tools/call stage_learning` |
| `priors commit <staged_id>` | `tools/call commit_learning` |
| `priors mark-stale <id>` | `tools/call mark_stale` |
| `priors link <source> <relation> <target>` | `tools/call link_entries` |
| `priors export <path>` | (CLI-only verb; produces a portable pack) |
| `priors import <path>` | (CLI-only verb; default `--dry-run`) |
| `priors health` | (CLI-only verb; integrity check) |
| `priors evals` | (CLI-only verb; runs the regression suite) |
| `priors mcp` | (starts MCP server over stdio) |
| `priors init-config --client <name>` | (prints client config snippet) |

## Safety boundaries

- All read/write operations are confined to `<project-root>/.priors/`. Resource IDs are validated against `^[a-z0-9-]+$`; anything else is rejected.
- Idempotency keys prevent duplicate writes from retries.
- The audit log is append-only.
- No constraint emission. The legacy `emit_constraint` / `applyEmission` surface is removed in v1.

## What changed from v0.3 (the legacy MCP server)

| v0.3 | v1 | Notes |
|---|---|---|
| `priors.init` tool | `priors init` CLI | Initialization is local to the project; not an MCP write. |
| `priors.recall` | `recall` | Same name, simpler signature. No decay/uncertainty gating. |
| `priors.reinforce` | (removed) | Activation/decay deferred per `docs/project-brief.md`. |
| `priors.writeEntry` | `commit_learning` (only via `staged_id`) | No direct active write path. Every active entry comes from a staged candidate. |
| `priors.distill` + `priors.verifyProposals` + `priors.commitProposals` | `stage_learning` + `commit_learning` | Two stages instead of three. Verification is part of staging, not separate. |
| `priors.emitConstraint` + `priors.applyEmission` | (removed) | Deferred to v2; see `docs/project-brief.md`. |
| `~/.priors/projects/<repo-id>/` neutral store | `<project-root>/.priors/` in-repo store | The store travels with the repo. |
| `priors://orientation/head` | `priors://brief` | Shorter, deterministic, bounded. |
| `priors://operator`, `priors://state`, `priors://compiled/...` | (removed) | The brief is the single orientation surface. |

For the legacy implementation, `git checkout legacy/v0.3.0`.
