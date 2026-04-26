# Security Policy

Priors is a local MCP server and CLI that reads and writes files inside a project's `.priors/` directory. It has no network surface and runs only when invoked.

## Reporting

Report security issues privately through GitHub repository security advisories. Do not open public issues for path traversal, arbitrary file write, or any class of issue that allows escape from the `.priors/` boundary.

## Current safety boundaries

- **Store boundary.** All read and write operations are confined to `<project-root>/.priors/`. Path traversal in entry IDs, staged proposal IDs, transcript paths, and resource URIs is rejected by validation in `src/util/safe-path.ts`.
- **Resource ID format.** Entry and staged IDs match a narrow safe pattern (`^[a-z0-9-]+$`). Anything else returns an error.
- **Idempotency.** Every write tool (`stage_learning`, `commit_learning`, `mark_stale`, `link_entries`) accepts a `client_request_id`. Replays return the original result instead of duplicating writes.
- **Audit trail.** Every write, link, mark-stale, distillation reject, and import is appended to `.priors/audit/actions.log` (JSONL). The audit file is append-only by convention.
- **No auto-commit.** `stage_learning` and any future hook may only write to `staged/`. The path from `staged/` to `entries/` is `commit_learning`, which requires an explicit user action.
- **No constraint emission in v1.** `emit_constraint` and `applyEmission` from the legacy v0.3 surface are removed in v1. They are deferred per `docs/project-brief.md`. Generating `.git/hooks/`, `.mcp.json`, or arbitrary executable artifacts from model output is explicitly out of scope.
- **Generated MCP client configs** pin the local Node executable (`process.execPath`) and the local CLI path. They do not generate `npx -y` configs that fetch remote code at runtime.
- **Quote-or-refuse verification.** `stage_learning` rejects any candidate whose `evidence.quote` does not appear verbatim in the supplied source content. This is enforced in code, not in prompt instructions.

## Out of scope (v1)

- Network operations of any kind. The MCP server speaks stdio JSON-RPC only.
- Multi-user access control. The store is local and assumes a single trust domain.
- Encryption at rest. The store is plain text by design (it should be readable in any text editor).
- Sandboxing of the calling agent. Priors does not constrain what the agent does outside the `.priors/` boundary.

## Returning to v0.3

The legacy v0.3 implementation included `priors.applyEmission` (write allowlisted artifacts under `.githooks/priors/*`, `scripts/priors/*`, `tests/priors/*`, `.config/priors/*`, gated by the `APPLY_PRIORS_EMISSION` environment variable). That surface is preserved at `git checkout legacy/v0.3.0` if you need it. It is not part of the v1 contract.
