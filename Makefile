# Priors v1 — local-first project memory.
#
# The contract lives in AGENTS.md. The specs live in docs/specs/. This Makefile
# is a thin convenience layer over the package.json scripts.

.PHONY: test test-unit test-regression brief mcp health help

help:
	@echo "Priors v1 — make targets:"
	@echo "  make test            — run unit + regression suites"
	@echo "  make test-unit       — run unit tests only"
	@echo "  make test-regression — run the seven AGENTS.md regression scenarios"
	@echo "  make brief           — render the project brief for this repo"
	@echo "  make mcp             — start the MCP server over stdio"
	@echo "  make health          — run the store integrity check"

test:
	@npm test

test-unit:
	@npm run test:unit

test-regression:
	@npm run test:regression

brief:
	@node bin/priors.js brief --project-root "$(CURDIR)"

mcp:
	@node bin/priors.js mcp --project-root "$(CURDIR)"

health:
	@node bin/priors.js health --project-root "$(CURDIR)"
