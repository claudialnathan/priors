---
id: pri-20260426-typescript-node25
kind: decision
status: active
confidence: high
as_of: 2026-04-26
created_at: 2026-04-26T05:30:00Z
updated_at: 2026-04-26T05:30:00Z
claim: "v1 is implemented in TypeScript on Node 25, importing .ts directly via Node's native type stripping, with zero runtime dependencies."
relations:
  supersedes: []
  contradicts: []
  reinforces: []
  derived_from: []
tags:
  - language
  - runtime
  - dependencies
---

## Why

The MCP TypeScript SDK is the reference implementation for the protocol. Node 25 added native TypeScript type stripping, so we can ship a single executable that runs `.ts` files directly without a build step, transpiler, or watcher. This keeps the runtime closure minimal — zero runtime dependencies — which is the only credible posture for a tool that lives in many users' agent harnesses.

## Alternatives considered

- **Python with `uv`/`pytest`**. Strong ecosystem and the `pydantic` schema story is excellent. Rejected because the MCP TypeScript SDK is more battle-tested in the Claude/Cursor/Codex client matrix and a Python implementation would require a separate stdio bridge.
- **TypeScript with `tsx` or a `tsc` build**. Rejected because either approach adds a build dependency to the runtime closure for no gain over Node 25's native stripping.
- **Rust or Go**. Rejected because the contributor surface for a v1 MCP server is heavily JS/TS. Cross-language bindings would slow iteration.

## Implications

- The minimum supported Node version is 25. We cannot relax this without picking up `tsx` or a build step.
- The package ships only `.ts` source plus the `bin/priors.js` wrapper.
- Dev-only `@types/*` packages are fine; runtime `dependencies` must stay at zero.
