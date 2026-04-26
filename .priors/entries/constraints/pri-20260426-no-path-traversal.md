---
id: pri-20260426-no-path-traversal
kind: constraint
status: active
confidence: high
as_of: 2026-04-26
created_at: 2026-04-26T05:30:00Z
updated_at: 2026-04-26T05:30:00Z
claim: "All read and write operations are confined to <project-root>/.priors/. Resource IDs match ^[a-z0-9-]+$ and any traversal attempt is rejected at the schema layer."
relations:
  supersedes: []
  contradicts: []
  reinforces: []
  derived_from: []
tags:
  - security
  - safety
  - schema
---

## Why

Priors writes files based on inputs the calling agent provides. Without strict validation a malicious or buggy caller could write anywhere on the filesystem. Confining all operations to `.priors/` and validating IDs against a narrow safe pattern prevents the entire class of escape-the-store bugs.

## How it is enforced

- `src/util/safe-path.ts` resolves any path argument relative to `<project-root>/.priors/` and rejects results that escape that root (after symlink resolution).
- Entry IDs, staged IDs, and resource URIs match `^[a-z0-9-]+$`. Anything else returns a schema validation error before any I/O happens.
- Every MCP tool input schema sets `additionalProperties: false`.
- A regression test in `tests/regression/` constructs path-traversal payloads (`../`, absolute paths, URL-encoded variants, symlinked targets) and asserts they are all rejected.
