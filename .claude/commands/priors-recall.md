---
description: Search /memories/priors/index.json by tag, type, or substring and return matched entries only.
argument-hint: <query>
---

# /priors-recall

Cheap retrieval over the priors. Reads `index.json` (small) and returns
only matched entries. Never loads the full `entries/` directory.

## Argument

`$ARGUMENTS` is the query. Can be:

- A tag (`testing`, `admin-dashboard`)
- A type (`correction`, `dead-end`)
- A substring of any entry summary
- A compound query like `type:dead-end testing` or `tag:database correction`

If no argument is given, list recently active tags and types with counts,
and ask the user what they want to search for.

## Search procedure

1. `memory.view /memories/priors/index.json`.
2. Parse the query:
   - `type:<x>` → filter `entries[].type == <x>`
   - `tag:<x>` → filter `entries[].tags includes <x>`
   - `file:<path>` → filter entries where `source.files` contains the
     path (prefix or suffix match both OK).
   - bare word → try in order: (a) exact tag match in `tags` keys,
     (b) case-insensitive substring match on `summary`, (c) case-
     insensitive substring match on any entry's `source.files` entries
     (entity-lookup: "SidebarGroupLabelDemo" finds entries mentioning
     `SidebarGroupLabelDemo.tsx`).
   - Multiple tokens → AND them.
3. Collect matching entry IDs. If >8 matches, show just summaries +
   IDs and ask the user which to load in full. If ≤8, load each via
   `memory.view /memories/priors/entries/<id>.yaml`.
4. Return the matched entries as a concise list — ID, type, date from
   ID prefix, summary, and whichever fields are relevant to the query
   (e.g., `correction` matches should show `correct_approach`; `dead-end`
   matches should show `conclusion` and `retry_conditions`; file-matches
   should show the matching `source.files` entry).

**Note on `source.files` search:** `index.json` does not currently
mirror `source.files`. For file/entity queries, fall back to a scan of
`entries/*.yaml` (cheap since filenames are date-prefixed; can grep
file contents if memory tool supports it, otherwise load candidate
entries by type-prefix and filter). This is acceptable in Phase 1;
Phase 2 should extend the index to include a `files` lookup map.

## Output shape

Keep it tight. Example:

```
Found 2 entries for `tag:testing`:

─ 2026-04-22-1530-constraint-no-db-mocks-in-integration
  constraint · No database mocks in integration tests under src/api/**.
  enforcement: pre-tool-use · derived from correction 2026-04-22-1430

─ 2026-04-22-1430-correction-test-mocking-approach
  correction · Wrote unit tests mocking DB layer; user wanted integration.
  correct: real DB. why: prior incident where mocks masked broken migration.
```

## Epistemic framing on return

When surfacing an entry, preserve its `valid_from` / `valid_through`
framing. If an entry is stale (past `valid_through` or > 90 days old and
never cited), flag it: `⚠ stale (last valid 2026-01-12)`.

Do NOT inject surfaced entries into reasoning as present-tense user
beliefs. They are "as of [date]" records.

## What NOT to do

- Do not load the full entries directory. Use the index.
- Do not modify entries during recall. Read-only operation.
- Do not return entries with `status: archived` unless the user asked
  explicitly (`--include-archived`, Phase 2).
- Do not fabricate matches. If nothing matches, say so and offer
  adjacent queries ("no entries for X, but here are entries tagged Y
  which might be related").
