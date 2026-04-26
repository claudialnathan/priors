import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assembleBrief,
  sectionBudgets,
  tokenCeiling,
} from "../../src/brief/assemble.ts";
import { withTempStore, seedEntry } from "../helpers/temp-store.ts";

test("brief on an empty store has no active entries and stays under the ceiling", async () => {
  await withTempStore(async (root, clock) => {
    const brief = await assembleBrief(root, { clock });
    assert.match(brief.text, /^# Project trajectory brief/);
    assert.match(brief.text, /Total entries: 0 active, 0 staged, 0 superseded/);
    assert.match(brief.text, /## Active decisions\n\(none yet/);
    assert.match(brief.text, /## Active constraints\n\(none yet\)/);
    assert.match(brief.text, /## Open questions\n\(none yet\)/);
    assert.match(brief.text, /## Contested or under review\n\(none\)/);
    assert.match(brief.text, /## Known dead ends \(most relevant 5\)\n\(none yet\)/);
    assert.ok(brief.totalTokens <= tokenCeiling());
  });
});

test("brief surfaces decisions ranked by confidence and recency", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-dec-low",
      kind: "decision",
      claim: "A low-confidence decision.",
      confidence: "low",
      updated_at: "2026-04-25T00:00:00Z",
    });
    await seedEntry(root, clock, {
      id: "pri-dec-high",
      kind: "decision",
      claim: "A high-confidence decision.",
      confidence: "high",
      updated_at: "2026-04-26T00:00:00Z",
    });
    const brief = await assembleBrief(root, { clock });
    const decIdx = brief.text.indexOf("## Active decisions");
    const high = brief.text.indexOf("pri-dec-high", decIdx);
    const low = brief.text.indexOf("pri-dec-low", decIdx);
    assert.ok(high > 0 && low > 0, `expected both ids in brief; got high=${high} low=${low}`);
    assert.ok(high < low, "high-confidence decision should come first");
  });
});

test("brief is byte-identical for identical store state", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-byte-1",
      kind: "decision",
      claim: "Decision one.",
      confidence: "high",
    });
    await seedEntry(root, clock, {
      id: "pri-byte-2",
      kind: "constraint",
      claim: "Constraint one.",
    });
    const a = await assembleBrief(root, { clock });
    const b = await assembleBrief(root, { clock });
    assert.equal(a.text, b.text);
    assert.deepEqual(a.tokens, b.tokens);
  });
});

test("brief surfaces dead-end rejection reasons when available", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-dead-1",
      kind: "failure",
      claim: "Active decay required hidden state and a daemon.",
      body: "\n## Notes\n\nApproach rejected because the daemon never shipped.\n",
    });
    const brief = await assembleBrief(root, { clock });
    assert.match(brief.text, /## Known dead ends/);
    assert.match(brief.text, /rejected because the daemon never shipped/);
  });
});

test("brief excludes stale entries from active sections", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-stale-active",
      kind: "decision",
      claim: "An active decision that should appear.",
      confidence: "high",
    });
    await seedEntry(root, clock, {
      id: "pri-stale-gone",
      kind: "decision",
      claim: "A stale decision that should be hidden.",
      status: "stale",
      stale_reason: "Replaced by v2 plan.",
    });
    const brief = await assembleBrief(root, { clock });
    assert.match(brief.text, /pri-stale-active/);
    assert.doesNotMatch(brief.text, /pri-stale-gone/);
  });
});

test("brief surfaces contested entries section when contradicts links exist", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-c-1",
      kind: "decision",
      claim: "First decision",
      status: "contested",
      relations: { contradicts: ["pri-c-2"] },
    });
    await seedEntry(root, clock, {
      id: "pri-c-2",
      kind: "decision",
      claim: "Conflicting decision",
      status: "contested",
      relations: { contradicts: ["pri-c-1"] },
    });
    const brief = await assembleBrief(root, { clock });
    assert.match(brief.text, /## Contested or under review/);
    assert.match(brief.text, /pri-c-1/);
    assert.match(brief.text, /pri-c-2/);
  });
});

test("brief surfaces the recently-superseded section within the 14-day window", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-sup-old",
      kind: "decision",
      claim: "Old approach.",
      status: "superseded",
      updated_at: "2026-04-22T00:00:00Z",
    });
    await seedEntry(root, clock, {
      id: "pri-sup-new",
      kind: "decision",
      claim: "New approach.",
      relations: { supersedes: ["pri-sup-old"] },
      updated_at: "2026-04-22T00:00:00Z",
    });
    const brief = await assembleBrief(root, { clock });
    assert.match(brief.text, /## Recently superseded/);
    assert.match(brief.text, /pri-sup-old/);
    assert.match(brief.text, /pri-sup-new/);
  });
});

test("brief footer points back at MCP resource URIs and recall", async () => {
  await withTempStore(async (root, clock) => {
    const brief = await assembleBrief(root, { clock });
    assert.match(brief.text, /priors:\/\/entry\/\{id\}/);
    assert.match(brief.text, /priors:\/\/audit\/\{id\}/);
    assert.match(brief.text, /recall\(query, filters\)/);
  });
});

test("section budgets and token ceiling are exposed for diagnostics", () => {
  assert.equal(tokenCeiling(), 2000);
  const budgets = sectionBudgets();
  assert.equal(typeof budgets.header, "number");
  const sum = Object.values(budgets).reduce((a, b) => a + b, 0);
  assert.ok(
    sum <= tokenCeiling(),
    `section budgets (${sum}) must fit under the token ceiling (${tokenCeiling()})`,
  );
});
