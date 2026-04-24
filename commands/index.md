---
description: Regenerate the priors index.json from all active entries. Idempotent.
---

# /priors:index

Rebuild `index.json` from the current `entries/` directory. Runs
automatically after `/priors:log`; can also be invoked manually if
entries were edited outside the normal flow.

## Store path

```bash
slug="$(pwd | sed 's|/|-|g')"
store="$HOME/.claude/projects/$slug/priors"
```

## What it does

1. List every `.yaml` file under `$store/entries/` via Bash (`ls
   "$store/entries/"*.yaml`). Archive is excluded by default.
2. For each, Read and extract the header fields: `id`, `type`, `summary`,
   `tags`, `status`, `derived_from` (if present), `supersedes` (if
   non-empty), `superseded_by` (if non-empty), `valid_through` (if
   present).
3. Skip entries with `status: archived` or `status: superseded` unless
   the user asked to include them. Entries whose `superseded_by` is
   non-empty should have `status: superseded` — surface a mismatch
   rather than papering over it.
4. Write the result to `$store/index.json` with this shape:

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

Use Write to overwrite `$store/index.json`. The file is regenerated
deterministically — no Edit needed.

## Determinism

Must be idempotent. Running it twice in a row with no entry changes must
produce byte-identical output (apart from the `updated` timestamp). That
means:

- Sort `entries[]` by `id` (which is date-prefixed, so chronological).
- Sort tag keys alphabetically; per-tag entry lists sorted by id.
- Sort type keys alphabetically.
- `updated` timestamp is the only field that changes between runs with
  no entry changes. That's acceptable.

## When called automatically

`/priors:log` invokes this at the end of its write sequence. In that
case, skip the preflight (we know what just changed) and just regenerate.

## When called manually

If the user runs `/priors:index` directly:

1. Confirm the command ran — report how many entries were indexed,
   how many tags exist, how many active vs archived.
2. If any entry file failed to parse, list the problem file(s) and
   abort — do NOT write a partial index. Bad parse should trigger a
   repair discussion with the user.

## What NOT to do

- Do not read full entry bodies beyond the header fields above. The
  index tracks headers only.
- Do not infer fields that aren't there. If an entry is missing `tags`
  or `summary`, that's a data-quality issue to surface, not to paper
  over.
- Do not include compiled outputs, `HEAD.md`, `operator.yaml`, or
  `state.json` in the index. Those have their own access paths.
