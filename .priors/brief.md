# Project trajectory brief
Project: priors (id: 02292673-6731-4fb6-8776-194628bccff0)
Generated: 2026-04-26 05:30 UTC
Last activity: today
Total entries: 14 active, 0 staged, 0 superseded

## Current state
No state entry recorded. Use `priors stage --kind state` to add one.

## Active decisions
- `pri-20260426-deterministic-brief` priors://brief is mechanically assembled from indexes/all.json. No LLM call inside the assembler. (as_of 2026-04-26, confidence: h)
- `pri-20260426-in-repo-store` The Priors store lives at <project-root>/.priors/, in the project's own repo. There is no shared ~/.priors directory. (as_of 2026-04-26, confidence: h)
- `pri-20260426-mcp-cli-mirror` The CLI mirrors the MCP surface one-to-one. Both call the same store/logic; whichever is changed, the other is changed in lockstep. (as_of 2026-04-26, confidence: h)
- `pri-20260426-stage-only-distillation` Distillation never auto-commits. stage_learning only writes to staged/; commit_learning is the only path to active entries/. (as_of 2026-04-26, confidence: h)
- `pri-20260426-typescript-node25` v1 is implemented in TypeScript on Node 25, importing .ts directly via Node's native type stripping, with zero runtime dependencies. (as_of 2026-04-26, confidence: h)

## Active constraints
- `pri-20260426-brief-token-ceiling` priors://brief must fit within ~2,000 tokens, enforced per-section per the budget table.
- `pri-20260426-idempotent-writes` Every MCP write tool accepts a client_request_id; repeated requests return the original result.
- `pri-20260426-no-path-traversal` All read/write operations confined to <project-root>/.priors/; resource IDs match ^[a-z0-9-]+$.
- `pri-20260426-quote-or-refuse` Every staged claim must be supported by a verbatim quote from the source, verified by code substring match.
- `pri-20260426-zero-runtime-deps` Priors has zero runtime dependencies. The package.json `dependencies` block is empty.

## Open questions
- `pri-20260426-contested-resolution-ux` What is the right CLI/MCP UX for resolving contested entries? (raised 2026-04-26)
- `pri-20260426-long-source-chunking` How should stage_learning handle source content that exceeds ~32K tokens? (raised 2026-04-26)
- `pri-20260426-rename-migration` When a project's directory is renamed, the UUID is canonical — but what about external references? (raised 2026-04-26)

## Contested or under review
(none)

## Recently superseded (last 14 days)
(none)

## Known dead ends
- `pri-20260426-decay-and-emit-overreach` v0.3 added active decay scoring, helpful/harmful counters, and emit_constraint; rejected for v1 because curation, not retrieval gymnastics, is the product.

## Suggested next moves
- Resolve `pri-20260426-rename-migration` before shipping `priors init-config` polish.
- Resolve `pri-20260426-long-source-chunking` once the regression suite has a >32K-token fixture.
- Resolve `pri-20260426-contested-resolution-ux` before users hit it in practice.

## How to fetch more
- Full entry:    priors://entry/{id}
- Evidence:      priors://audit/{id}
- Chronology:    priors://log
- Search:        recall(query, filters)
