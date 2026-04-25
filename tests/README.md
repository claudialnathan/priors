# Priors Test Suite

Run the full active suite with:

```bash
make test
```

Active tests:

```text
tests/
  mcp/
    run-tests.mjs
```

## MCP Invariants

- `initialize`, `tools/list`, `resources/list`, and `prompts/list` work over stdio JSON-RPC.
- Every MCP tool exposes an input schema and output schema.
- Tool calls return structured content plus text content.
- `priors.init` creates a vendor-neutral store under `~/.priors`.
- `priors.writeEntry` validates, commits, regenerates `index.json`, and records audit events.
- `priors.recall` skips low-uncertainty reads unless forced and reports decay metadata.
- `priors.reinforce` only rewards helpful entries when the response succeeded.
- `priors.distill` stages actionable trajectory proposals and `priors.verifyProposals` checks transcript evidence.
- `priors.commitProposals` refuses low-confidence commits unless the risk token is present.
- `priors.emitConstraint` and `priors.applyEmission` only write allowlisted artifacts.
- Resource reads reject path-traversal entry IDs.
- `init-config --dry-run` pins the local Node executable instead of generating `npx` configs.

## Reference Material

The old Claude plugin hook tests, eval scenarios, and fixtures were moved into the ignored `.reference/` folder. They are available locally as migration context, but they are no longer part of the active repository surface.
