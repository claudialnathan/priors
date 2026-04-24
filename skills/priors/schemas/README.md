# Entry schemas

JSON Schema (in YAML form) for each priors entry type. Used by:

- **The agent**, when writing new entries via `/priors-log` — the skill references these to validate shape before write.
- **Contract tests** (`tests/contract/test-schemas.bats`), which validate sample entries against these schemas on every change.

One schema per type, plus a `_base.yaml` carrying common fields inherited via `$ref`. The `operator.yaml` schema is intentionally different — it describes the single rolling `operator.yaml` file, not a per-entry record.

Schemas are normative. If the prose in `internal/phase-1-spec.md §3` disagrees with these files, the schemas win and the spec gets updated.
