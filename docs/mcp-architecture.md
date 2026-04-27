# Priors MCP Architecture (v1)

Priors v1 is an MCP-first local tool. The MCP server and the CLI both call into the same store/logic; whichever surface you change, change the other.

For product overview and installation, see [`../README.md`](../README.md). For the locked surface specs, see [`specs/brief-resource.md`](specs/brief-resource.md) and [`specs/staged-distillation.md`](specs/staged-distillation.md).

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
  config.json           # { groundingMode: "strict" | "warn", commitThreshold: number }
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
    curation.log        # JSONL: typed staging/edge events (propose, stage, edit, accept, reject, discard, propose_edge, accept_edge, discard_edge)
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
- `priors://audit/{id}` — filtered audit-log slice for a single entry id, newest first (JSON).

### Tools

| Tool | Input | Output |
|---|---|---|
| `recall` | `query`, optional `kind`/`status`/`confidence`/`as_of_after`/`as_of_before`/`relation`/`limit` | `{ matches: [{ id, kind, claim, status, confidence, as_of, updated_at }] }` |
| `get_entry` | `id` | `{ entry: <full entry>, incoming_edges: [...] }` |
| `stage_learning` | `source_kind`, `source_ref`, `source_content`, `project_id`, optional `candidates`, `existing_entries`, `prompt_context`, `source_model`, `client_request_id` | If `candidates` omitted: `{ prompt: <rendered system prompt>, instruction: "produce candidates and call back" }`. If provided: `{ staged: [...], rejected: [...], audit_id }`. |
| `edit_staged` | `staged_id`, optional `claim`/`confidence`/`tags`/`body`/`rationale`/`source_model`/`client_request_id` | `{ staged_id, audit_id }` (evidence is immutable; pre/post payloads written to `curation.log`) |
| `discard_staged` | `staged_id`, optional `rationale`/`source_model`/`client_request_id` | `{ staged_id, audit_id }` (original payload preserved in the `discard` event) |
| `commit_learning` | `staged_id`, optional `source_model`, `client_request_id` | `{ entry_id, audit_id }` (rejected with `below_threshold` if the composite score is under `commitThreshold`) |
| `mark_stale` | `id`, `reason`, `client_request_id` | `{ entry_id, audit_id }` |
| `link_entries` | `source_id`, `relation` (`supersedes`/`contradiction_of`/`derived_from`/`reinforces`/`caused_by`/`blocks`/`depends_on`/`refutes`), `target_id`, `client_request_id` | `{ source_id, target_id, relation, audit_id }` |
| `propose_edge` | `source_id`, `relation` (same vocab), `target_id`, optional `proposal_id`/`source_model`/`source_ref`/`rationale`/`client_request_id` | `{ proposal_id, audit_id }` — does not create the edge; emits a `propose_edge` event only |
| `commit_edge` | `proposal_id`, `source_id`, `relation`, `target_id`, optional `source_model`/`source_ref`/`rationale`/`client_request_id` | `{ source_id, target_id, relation, audit_id }` — calls `link_entries` internally and emits `accept_edge` |
| `discard_edge` | `proposal_id`, `source_id`, `relation`, `target_id`, optional `rationale`/`source_model`/`client_request_id` | `{ proposal_id, audit_id }` — emits `discard_edge`; edge state unchanged |

The 8-relation vocabulary is capped: a ninth requires removing one. Only `supersedes` and `contradiction_of` mutate target status (`superseded` and `contested` respectively); the other six are pure links. Self-links and `supersedes` cycles are rejected.

Every tool input schema has `additionalProperties: false`. Every tool returns both `structuredContent` and a textual `content[0].text` rendering for clients that don't consume typed output.

### Prompts

- `priors_distill` — renders the conservative-archivist system prompt from `docs/specs/staged-distillation.md` with the source content interpolated. The calling agent's model produces JSON candidates; the agent then calls `stage_learning` with those candidates for verification.

## Verification: stage_learning in detail

`stage_learning` is the riskiest correctness surface. It enforces "quote, or refuse" deterministically:

1. **Schema validation** — candidate JSON must conform to the schema in `docs/specs/staged-distillation.md`.
2. **Quote presence** — every `evidence.quote` must appear verbatim in `source_content` (case-sensitive, whitespace-tolerant). Failures drop the candidate. Always fails closed regardless of `groundingMode`.
3. **Grounding floor** — claim↔evidence Dice-coefficient overlap must be ≥ `0.15` (tokens shorter than 4 chars stripped). `groundingMode: "strict"` (default) rejects with `ungrounded_claim`; `groundingMode: "warn"` stages with a `grounding_warning` flag and `unsupported_substrings` recorded on the curation event.
4. **Forbidden kinds** — any candidate that targets user preference, identity, or psychology is dropped.
5. **Length bounds** — `claim` ≤ 280 chars, `reasoning` ≤ 600 chars, `evidence` between 1 and 5 quotes per candidate.
6. **Confidence sanity** — high confidence candidates must have substring overlap between the strongest quote and the claim.
7. **Deduplication** — claims >80% similar to an active entry's claim convert to a `relations.reinforces` link rather than a new candidate.
8. **Composite quality score** — six deterministic sub-scores (`schema_ok`, `length_ok`, `forbidden_kind`, `evidence_count`, `transcript_support`, `duplicate_risk`) are aggregated as `min(...)`. The score is recorded on every `propose` and `reject` curation event. `commit_learning` rejects with `below_threshold` if the score is under `commitThreshold` (default `0.0`, which preserves prior behaviour). See `src/distill/score.ts`.

Dropped candidates are appended to `audit/distillation-rejects.log` with the rejection reason. Verified candidates are written to `staged/` as YAML+markdown files. Every step also emits a typed event to `audit/curation.log` (`propose`, `stage`, `reject`).

## Determinism: the brief

`priors://brief` is assembled, never generated. Two runs against the same store produce byte-identical output.

- The assembler reads `indexes/all.json` and applies the per-section ranking rules in [`specs/brief-resource.md`](specs/brief-resource.md#assembly-logic).
- Each section has a token budget. If a section overflows, items are dropped per the spec's overflow policy. The brief never globally re-truncates.
- Tokens are counted with a simple character-based approximation (`ceil(chars / 4)` for English). This is conservative and dependency-free; the v1 store doesn't depend on a tokenizer library. See `src/util/tokens.ts`.

## Idempotency

Every write tool accepts an optional `client_request_id`. The MCP server keeps a small replay cache (`audit/idempotency.json`, capped) keyed by `(tool, client_request_id)`. A repeated request with a known ID returns the cached response instead of writing again.

## CLI

The CLI mirrors the MCP surface one-to-one:

| CLI | MCP |
|---|---|
| `priors init` | (one-off; sets up `.priors/`) |
| `priors brief` | `resources/read priors://brief` |
| `priors recall <query>` | `tools/call recall` |
| `priors get <id>` | `tools/call get_entry` |
| `priors stage` | `tools/call stage_learning` |
| `priors edit-staged <staged_id> [...]` | `tools/call edit_staged` |
| `priors discard <staged_id>` | `tools/call discard_staged` |
| `priors commit <staged_id>` | `tools/call commit_learning` |
| `priors mark-stale <id>` | `tools/call mark_stale` |
| `priors link <source> <relation> <target>` | `tools/call link_entries` |
| `priors propose-edge <source> <relation> <target>` | `tools/call propose_edge` |
| `priors commit-edge <proposal_id> <source> <relation> <target>` | `tools/call commit_edge` |
| `priors discard-edge <proposal_id> <source> <relation> <target>` | `tools/call discard_edge` |
| `priors audit <id>` | `resources/read priors://audit/{id}` |
| `priors audit curation [--since --kind --source-model]` | (CLI-only verb; reads `audit/curation.log`) |
| `priors export <path>` | (CLI-only verb; produces a portable pack) |
| `priors import <path>` | (CLI-only verb; default `--dry-run`) |
| `priors index` | `resources/read priors://index` |
| `priors migrate-relations [--dry-run]` | (CLI-only one-shot; rewrites legacy `contradicts` → `contradiction_of`) |
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
| `priors.reinforce` | (removed) | Activation/decay is deferred from v1. |
| `priors.writeEntry` | `commit_learning` (only via `staged_id`) | No direct active write path. Every active entry comes from a staged candidate. |
| `priors.distill` + `priors.verifyProposals` + `priors.commitProposals` | `stage_learning` + `commit_learning` | Two stages instead of three. Verification is part of staging, not separate. |
| `priors.emitConstraint` + `priors.applyEmission` | (removed) | Deferred from v1. |
| `~/.priors/projects/<repo-id>/` neutral store | `<project-root>/.priors/` in-repo store | The store travels with the repo. |
| `priors://orientation/head` | `priors://brief` | Shorter, deterministic, bounded. |
| `priors://operator`, `priors://state`, `priors://compiled/...` | (removed) | The brief is the single orientation surface. |

For the legacy implementation, `git checkout legacy/v0.3.0`.
