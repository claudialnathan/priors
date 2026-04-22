---
description: Regenerate /memories/playbook/index.json from all active entries. Idempotent.
---

# /playbook-index

Rebuild `index.json` from the current `entries/` directory. Runs
automatically after `/playbook-log`; can also be invoked manually if
entries were edited outside the normal flow.

## What it does

1. List every `.yaml` file under `/memories/playbook/entries/` (and
   optionally `/memories/playbook/archive/` if the user passes
   `--include-archive`, Phase 2).
2. For each, extract the header fields: `id`, `type`, `summary`, `tags`,
   `status`, `derived_from` (if present), `valid_through` (if present).
3. Skip entries with `status: archived` or `status: superseded_by:<id>`
   unless the user asked to include them.
4. Write the result to `/memories/playbook/index.json` with this shape:

```json
{
  "updated": "<ISO-8601 timestamp>",
  "entries": [
    {
      "id": "2026-04-22-1530-constraint-no-db-mocks-in-integration",
      "type": "constraint",
      "summary": "No database mocks in integration tests under src/api/**.",
      "tags": ["testing", "integration-tests", "database", "gotcha"],
      "status": "active",
      "derived_from": "2026-04-22-1430-correction-test-mocking-approach"
    }
  ],
  "tags": {
    "testing": ["2026-04-22-1530-...", "2026-04-22-1430-..."],
    "database": ["2026-04-22-1530-..."]
  },
  "types": {
    "correction": ["2026-04-22-1430-..."],
    "constraint": ["2026-04-22-1530-..."]
  }
}
```

5. Use `memory.create` to overwrite `index.json` (or `memory.str_replace`
   if that's cheaper for small deltas — either is fine, the file is
   regenerated deterministically).

## Determinism

This command must be idempotent. Running it twice in a row with no entry
changes must produce byte-identical output. That means:

- Sort `entries[]` by `id` (which is date-prefixed, so chronological).
- Sort tag keys alphabetically; per-tag entry lists sorted by id.
- Sort type keys alphabetically.
- `updated` timestamp is the only field that changes between runs with
  no entry changes. That's acceptable.

## When called automatically

`/playbook-log` invokes this at the end of its write sequence. In that
case, skip the preflight (we know what just changed) and just regenerate.

## When called manually

If the user runs `/playbook-index` directly:

1. Confirm the command ran — report how many entries were indexed,
   how many tags exist, how many active vs archived.
2. If any entry file failed to parse, list the problem file(s) and
   abort — do NOT write a partial index. Bad parse should trigger a
   repair discussion with the user.

## What NOT to do

- Do not read full entry bodies. The index tracks headers only. Reading
  every entry on every index regen defeats the token-economy of the
  design.
- Do not infer fields that aren't there. If an entry is missing `tags`
  or `summary`, that's a data-quality issue to surface, not to paper
  over.
- Do not include compiled outputs, `HEAD.md`, `operator.yaml`, or
  `state.json` in the index. Those have their own access paths.
