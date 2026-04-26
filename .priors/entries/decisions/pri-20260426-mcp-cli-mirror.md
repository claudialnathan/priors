---
id: pri-20260426-mcp-cli-mirror
kind: decision
status: active
confidence: high
as_of: 2026-04-26
created_at: 2026-04-26T05:30:00Z
updated_at: 2026-04-26T05:30:00Z
claim: "The CLI mirrors the MCP surface one-to-one. Both call the same store/logic; whichever is changed, the other is changed in lockstep."
relations:
  supersedes: []
  contradicts: []
  reinforces: []
  derived_from: []
tags:
  - cli
  - mcp
  - architecture
---

## Why

Two surfaces, one engine. Drift between CLI and MCP is the most common bug pattern in tools that grow both — the CLI gets a flag that the MCP tool doesn't accept, or the MCP tool emits a field the CLI doesn't render. Forcing both to call into the same `src/store/`, `src/brief/`, `src/distill/`, and `src/schema/` modules means a single change touches both paths.

## Implications

- A new MCP tool is also a CLI verb in the same PR.
- The CLI does not gain shape that the MCP tool doesn't expose (e.g., no interactive prompts that aren't available over MCP).
- `priors mcp` is itself a CLI subcommand that starts the stdio server, so a single `bin/priors.js` wrapper covers both.

## Out of scope

- A CLI-only wizard or interactive REPL. The CLI must remain agent-friendly. Interactive features are reserved for editor integrations on top of MCP.
