# Priors — MCP-first.

.PHONY: test help

help:
	@echo "Priors test targets:"
	@echo "  make test   — run MCP protocol/security tests"

test:
	@node tests/mcp/run-tests.mjs
