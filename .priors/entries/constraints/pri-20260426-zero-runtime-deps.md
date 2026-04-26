---
id: pri-20260426-zero-runtime-deps
kind: constraint
status: active
confidence: high
as_of: 2026-04-26
created_at: 2026-04-26T05:30:00Z
updated_at: 2026-04-26T05:30:00Z
claim: "Priors has zero runtime dependencies. The package.json `dependencies` block is empty; only devDependencies and types are allowed."
relations:
  supersedes: []
  contradicts: []
  reinforces:
    - pri-20260426-typescript-node25
  derived_from: []
tags:
  - dependencies
  - supply-chain
  - security
---

## Why

A tool that lives in many users' agent harnesses has a security and trust profile much closer to a system utility than a typical npm package. Every transitive dependency is a supply-chain attack vector. The runtime is small enough — stdio JSON-RPC, file I/O, YAML/Markdown parsing — that pulling in third-party code is unjustified.

Node 25 ships everything we need: `crypto.randomUUID`, `fs/promises`, `path`, `node:stream`, `node:test`, native `.ts` type stripping. YAML frontmatter and the simple search index can be implemented in-tree.

## Enforcement

- CI gate: `npm install --omit=optional` followed by a check that `package.json` has no `dependencies` block (or that it is empty).
- Test: a regression test that imports every module in `src/` from a fresh Node 25 binary with no `node_modules/` and confirms the import succeeds.

## Allowed exceptions

- `devDependencies` may include `@types/node` and any test-only helpers. They never ship to runtime.
- A future MCP TypeScript SDK dependency may be revisited if the SDK becomes the de-facto serialization layer; revisit only with a new spec doc.
