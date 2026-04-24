# Priors — Phase 1.
#
# One test: audits the two hook scripts. See tests/README.md.

.PHONY: test help

help:
	@echo "Priors — Phase 1 test targets:"
	@echo "  make test   — audit hook scripts (silent-failure guard, path, shape)"

test:
	@bash tests/contract/test-hooks.sh
