import { test } from "node:test";
import assert from "node:assert/strict";
import { runEvalSuite } from "../../src/evals/runner.ts";

test("seven regression scenarios pass end-to-end", async () => {
  const result = await runEvalSuite();
  if (!result.ok) {
    const failures = result.tasks
      .filter((t) => !t.ok)
      .map((t) => `- ${t.id}: ${t.error ?? "unknown"}`)
      .join("\n");
    assert.fail(`eval suite failed:\n${failures}`);
  }
  assert.equal(result.total, 7);
  assert.equal(result.passed, 7);
  assert.equal(result.failed, 0);
});

test("eval suite covers the seven non-negotiable scenarios", async () => {
  const result = await runEvalSuite();
  const ids = new Set(result.tasks.map((t) => t.id));
  for (const expected of [
    "fresh_agent_handoff",
    "dead_end_recall",
    "mark_stale_flow",
    "conflict_contested",
    "distillation_safety",
    "emission_deferred",
    "cross_client",
  ]) {
    assert.ok(ids.has(expected), `missing eval task: ${expected}`);
  }
});
