# Security Policy

Priors is a local MCP server that can write project files through explicit tools.

## Reporting

Report security issues privately through GitHub repository security advisories when available. Do not open public issues for path traversal, arbitrary command execution, credential exposure, or unsafe emission bypasses.

## Current Safety Boundaries

- The canonical store is outside repos under `~/.priors`.
- `priors.applyEmission` requires the `APPLY_PRIORS_EMISSION` approval token.
- Low-confidence proposal commits require the `I_ACCEPT_PRIORS_RISK` approval token.
- Emissions may only target `.githooks/priors/*`, `scripts/priors/*`, `tests/priors/*`, or `.config/priors/*`.
- Direct `.git/hooks` and `.mcp.json` writes through emissions are rejected.
- Transcript paths and resource IDs are validated against traversal.
- Generated MCP client configs pin the local Node executable and local server path.
