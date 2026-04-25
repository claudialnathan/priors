# Priors Agent Instructions

Use the `priors` MCP server for project memory.

- At session start, read `priors://orientation/head`, `priors://operator`, and `priors://state`.
- Use decay-gated recall, not flat always-on retrieval. For architectural, testing, enforcement, or otherwise uncertain decisions, call `priors.recall` with the relevant tags, paths, or topic and an `uncertainty` value. Skip recall for low-uncertainty local work unless the user or project context makes memory relevant.
- After a successful response, call `priors.reinforce` only for entries that actively shaped the answer or action. Do not reinforce entries that were merely retrieved.
- Distill durable memory as trajectory intelligence: failures, recoveries, optimizations, constraints, and decisions with evidence. Do not store raw logs or generic facts as memory.
- Write durable memory only through Priors MCP tools such as `priors.writeEntry`, `priors.distill`, `priors.verifyProposals`, and `priors.commitProposals`.
- Treat entries as dated, project-scoped records. Do not frame stored operator context as timeless user belief.
- Never edit `~/.priors` directly. Use MCP tools so validation, index regeneration, and audit logging run.
- Constraint emission is review-first. Do not write `.git/hooks`, `.mcp.json`, or arbitrary executable scripts from model text.

## GitHub workflow defaults for this repo

- Use branch-first flow: never commit directly to `main`.
- Use Conventional Commits and keep each PR single-purpose.
- Run `npm test` before pushing and treat CI failures as merge blockers.
- Prefer tags/releases only for meaningful milestones on `main`, using semver (`vMAJOR.MINOR.PATCH`).
- For behavior changes, include tests and docs updates in the same PR.
