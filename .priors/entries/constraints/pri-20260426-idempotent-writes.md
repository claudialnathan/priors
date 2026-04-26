---
id: pri-20260426-idempotent-writes
kind: constraint
status: active
confidence: high
as_of: 2026-04-26
created_at: 2026-04-26T05:30:00Z
updated_at: 2026-04-26T05:30:00Z
claim: "Every MCP write tool accepts a client_request_id. Repeated requests with the same ID return the original result instead of writing again."
relations:
  supersedes: []
  contradicts: []
  reinforces: []
  derived_from: []
tags:
  - mcp
  - reliability
  - idempotency
---

## Why

Agents retry. Networks drop. MCP clients can re-send a tool call after a transport hiccup. Without idempotency keys we get duplicate staged entries, duplicate links, duplicate mark-stale events — silent corruption that compounds.

## Scope

The following write tools accept `client_request_id`:

- `stage_learning`
- `commit_learning`
- `mark_stale`
- `link_entries`
- `import_pack` (CLI verb, but the same idempotency key applies)

Reads (`recall`, `get_entry`) do not require it.

## How it is enforced

- A small replay cache (`audit/idempotency.json`, capped) keys on `(tool, client_request_id)` and returns the cached response on a hit.
- The cache rotates by size; entries older than the cap are dropped. The audit log is the source of truth for reconciliation.
- `client_request_id` is optional in the schema; missing IDs disable replay protection for that call.
