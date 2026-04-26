# Priors v1 — Test Suite

This directory contains the v1 test suite. The contract lives in `AGENTS.md`; the specs live in `docs/specs/`. Tests exist to enforce both.

## Run

```bash
make test               # full suite (unit + regression)
make test-unit          # unit tests only
make test-regression    # the seven AGENTS.md regression scenarios
```

Or directly via npm:

```bash
npm test
npm run test:unit
npm run test:regression
```

The runner is Node's built-in `node --test`. There is no Mocha, Jest, or Vitest dependency — see `AGENTS.md` § "Local-first, file-based" and the zero-runtime-dependency constraint.

## Layout

```text
tests/
  unit/          # per-module unit tests (one file per src/<module>)
  regression/    # the seven AGENTS.md regression scenarios
  fixtures/      # sample stores, transcripts, and source content
  snapshots/     # frozen brief outputs for determinism tests
```

## Unit coverage (target)

| Module | Covers |
|---|---|
| `store/` | entry validation, write atomicity, index regeneration, identity (UUID survives rename) |
| `brief/` | section ranking, per-section truncation, 2,000-token ceiling, byte-identical output for identical state |
| `distill/` | quote substring match, forbidden kinds, length bounds, dedup → `reinforces` link, reject log |
| `schema/` | every MCP tool input/output is `additionalProperties: false`, accepts examples, rejects path traversal |
| `mcp/` | `initialize`, `tools/list`, `resources/list`, `prompts/list`, idempotency replay cache |
| `cli/` | every CLI verb maps one-to-one to its MCP tool and returns the same shape |
| `util/` | `safe-path` rejects traversal, UUID v4 format, YAML round-trip, token approximation bounds |

## Regression scenarios (the seven)

These are end-to-end scenarios drawn from `AGENTS.md` and `docs/project-brief.md`. Each runs against a fixture store and asserts a behavior that v1 promised:

1. **Fresh agent handoff.** A new agent reads `priors://brief`, then makes the right next move with no other context.
2. **Dead-end recall.** `recall(kind: failure)` surfaces rejected approaches with reasons before the agent re-tries them.
3. **Mark-stale flow.** A `decision` is marked stale; the brief reflects it; `recall(status: stale)` surfaces it on demand.
4. **Conflict / contested.** `link_entries(... contradicts ...)` sets both sides to `contested`; the brief shows both.
5. **Distillation safety.** A transcript with a fabricated claim is staged; verification rejects the fabricated candidate and logs it.
6. **Emission deferred.** Any attempt to use `emit_constraint` / `applyEmission` returns "not in v1" — the legacy v0.3 surface is gone.
7. **Cross-client.** A store written by the CLI is read identically by the MCP server, and vice versa.

## Determinism guarantees

- The brief assembler is deterministic. The same store state must produce byte-identical output across two runs. Snapshot tests in `tests/snapshots/brief/` enforce this.
- `indexes/all.json` is sorted by `id` (lexicographic), and entries within sections are sorted per `docs/specs/brief-resource.md`.

## Returning to the v0.3 test suite

The legacy MCP test runner (`tests/mcp/run-tests.mjs`) is preserved at the tag `legacy/v0.3.0`:

```bash
git checkout legacy/v0.3.0
npm test
```

It is not maintained on `main`/`reval`.
