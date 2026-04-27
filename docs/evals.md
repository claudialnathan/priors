# Evaluations

Priors ships a seven-task regression suite. The suite is the contract: if any
task fails, the change is not done. The tasks come directly from the v1
safety boundaries described in the README and the public specs.

The suite is exposed three ways:

- **`priors evals`** — runs all seven tasks, exits non-zero on failure. This
  is the gate to wire into CI.
- **`npm run test:regression`** — runs the same suite via `node --test` so
  failures appear inline with unit tests.
- **`runEvalSuite()`** — the underlying function exported from
  `src/evals/runner.ts`, useful when embedding Priors checks in a larger
  test runner.

---

## The seven tasks

Each task instantiates a temp `.priors/` store, exercises one non-negotiable,
and asserts on observable behavior. No task depends on shared state.

| ID                     | What it proves                                                                |
| ---------------------- | ----------------------------------------------------------------------------- |
| `fresh_agent_handoff`  | The brief is bounded, deterministic, and orienting on a small fixture.        |
| `dead_end_recall`      | `recall(kind: failure)` surfaces dead ends; the brief includes their reasons. |
| `mark_stale_flow`      | `mark_stale` flips status, hides the entry from the brief, and shows up in `recall(status: stale)`. |
| `conflict_contested`   | `link_entries(contradicts)` sets both entries to `contested` and the brief surfaces the pair. |
| `distillation_safety`  | `stage_learning` rejects fabricated quotes via the verbatim substring check.  |
| `emission_deferred`    | `emit_constraint` is **not** in `tools/list` and a direct call returns an error. |
| `cross_client`         | Exporting from one store and importing into another, then reading via the MCP server, yields the same entries. |

---

## Running the suite

From the project root:

```bash
# CLI (intended for CI)
priors evals

# As part of `npm test`
npm run test:regression

# Programmatic (Node)
node --input-type=module -e "import { runEvalSuite } from './src/evals/runner.ts'; const r = await runEvalSuite(); console.log(r); process.exit(r.ok ? 0 : 1);"
```

The CLI command prints a short summary per task, then a final line:

```
priors evals: 7/7 passed (0 failed)
```

A failed task prints the assertion that fired and exits with status 1.

---

## What "deterministic" means here

Two specific tasks check determinism:

1. **`fresh_agent_handoff`** verifies that the brief stays under the 2000-token
   ceiling and contains the expected sections.
2. **`tests/snapshots/brief-determinism.test.ts`** (run alongside the suite
   via `npm test`) asserts byte-identical brief output across three independent
   stores built from the same seed fixture (with the per-store project UUID
   normalized — UUIDs are intentionally random per `priors init`).

If you need to relax determinism (you should not), update the snapshot test
in the same PR and explain why in the commit message.

---

## When to add a regression task

The seven tasks cover the v1 non-negotiables. Add a new task when:

- You are about to enable a behavior that v1 deferred (decay, emission,
  multi-project store) and you need to assert the v1 invariant survives the
  change.
- You found a bug whose root cause is one of the existing non-negotiables and
  the existing task did not catch it. Tighten the assertion in the existing
  task first; only add a new task if a new invariant is involved.
- You are adding a new MCP tool. Add at least one regression task that uses
  it end-to-end.

Do **not** add tasks that exercise unit-level concerns (string formatting,
small validators). Those belong in `tests/unit/`.

---

## What an eval task looks like

Each task is a `() => Promise<string | undefined>`. Returning a string puts a
short detail next to the task name in the report; throwing an error fails
the task. A typical task:

```ts
async function markStaleFlow(): Promise<string> {
  return withTempStore(async (root, clock) => {
    await seedEntry(root, clock, { /* ... */ });
    const result = await markStale(root, { id: "...", reason: "..." });
    if (result.status !== "stale") throw new Error("status was not stale");
    return "stale flow ok";
  });
}
```

`withTempStore` and `seedEntry` are local helpers in `src/evals/runner.ts`
that hold the suite to file-system reality. The runner deletes the temp
store when the task ends.

---

## CI wiring

The repo is intended to gate merges on the suite. A minimal GitHub Actions
job:

```yaml
- uses: actions/setup-node@v4
  with: { node-version: '25' }
- run: npm ci
- run: npm test
- run: node bin/priors.js evals --project-root "$PWD"
```

`npm test` runs unit, snapshot, and regression suites. The explicit
`priors evals` line is redundant in CI but useful when you want a clear,
agent-readable report on the v1 contract specifically.
