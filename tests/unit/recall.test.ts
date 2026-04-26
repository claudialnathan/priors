import { test } from "node:test";
import assert from "node:assert/strict";
import { recall, validateRecallInput } from "../../src/recall/recall.ts";
import { withTempStore, seedEntry } from "../helpers/temp-store.ts";

test("validateRecallInput rejects unknown fields and bad types", () => {
  assert.throws(() => validateRecallInput("nope"), /must be an object/);
  assert.throws(() => validateRecallInput({ surprise: 1 }), /unknown field surprise/);
  assert.throws(() => validateRecallInput({ kind: "bogus" }), /kind must be one of/);
  assert.throws(() => validateRecallInput({ status: "deleted" }), /status must be one of/);
  assert.throws(
    () => validateRecallInput({ confidence: "v-high" }),
    /confidence must be one of/,
  );
  assert.throws(
    () => validateRecallInput({ as_of_after: "26-04-2026" }),
    /as_of_after must be YYYY-MM-DD/,
  );
  assert.throws(
    () => validateRecallInput({ limit: 0 }),
    /limit must be an integer 1\.\.100/,
  );
  assert.throws(
    () => validateRecallInput({ limit: 101 }),
    /limit must be an integer/,
  );
  assert.throws(
    () => validateRecallInput({ query: "x".repeat(501) }),
    /query must be a string/,
  );
});

test("validateRecallInput shapes a relation filter", () => {
  const out = validateRecallInput({
    relation: { kind: "supersedes", direction: "from", target: "pri-x" },
  });
  assert.deepEqual(out.relation, {
    kind: "supersedes",
    direction: "from",
    target: "pri-x",
  });
});

test("validateRecallInput rejects malformed relation filter", () => {
  assert.throws(
    () => validateRecallInput({ relation: { kind: "bad", direction: "from", target: "x" } }),
    /relation\.kind must be one of/,
  );
  assert.throws(
    () => validateRecallInput({ relation: { kind: "supersedes", direction: "sideways", target: "x" } }),
    /relation\.direction/,
  );
  assert.throws(
    () => validateRecallInput({ relation: { kind: "supersedes", direction: "from", target: "" } }),
    /relation\.target/,
  );
});

test("recall plain-text query scores claim hits higher than body hits", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-q-claim",
      kind: "pattern",
      claim: "Use idempotency keys for retried writes.",
      body: "\n## Notes\n\nNotes here.\n",
    });
    await seedEntry(root, clock, {
      id: "pri-q-body",
      kind: "pattern",
      claim: "Token budget the brief.",
      body: "\n## Notes\n\nIdempotency is mentioned only in the body.\n",
    });
    const result = await recall(root, { query: "idempotency" });
    assert.equal(result.total, 2);
    assert.equal(result.hits[0]?.id, "pri-q-claim");
    assert.equal(result.hits[1]?.id, "pri-q-body");
    assert.ok((result.hits[0]?.score ?? 0) > (result.hits[1]?.score ?? 0));
  });
});

test("recall filters by kind, status, and confidence", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-f-decision",
      kind: "decision",
      claim: "A decision.",
      confidence: "high",
    });
    await seedEntry(root, clock, {
      id: "pri-f-failure",
      kind: "failure",
      claim: "A failure.",
      confidence: "high",
    });
    await seedEntry(root, clock, {
      id: "pri-f-stale",
      kind: "decision",
      claim: "A stale decision.",
      status: "stale",
      stale_reason: "outdated",
    });
    const decisions = await recall(root, { kind: "decision" });
    assert.equal(decisions.total, 2);
    const stale = await recall(root, { status: "stale" });
    assert.equal(stale.hits.length, 1);
    assert.equal(stale.hits[0]?.id, "pri-f-stale");
    const high = await recall(root, { confidence: "high" });
    assert.equal(high.total, 2);
  });
});

test("recall relation:from finds entries that have the link", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-rel-old",
      kind: "decision",
      claim: "Old approach.",
      status: "superseded",
    });
    await seedEntry(root, clock, {
      id: "pri-rel-new",
      kind: "decision",
      claim: "New approach.",
      relations: { supersedes: ["pri-rel-old"] },
    });
    const fromHits = await recall(root, {
      relation: {
        kind: "supersedes",
        direction: "from",
        target: "pri-rel-old",
      },
    });
    assert.equal(fromHits.total, 1);
    assert.equal(fromHits.hits[0]?.id, "pri-rel-new");
  });
});

test("recall relation:to finds entries that the target points TO", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-rel-old",
      kind: "decision",
      claim: "Old approach.",
      status: "superseded",
    });
    await seedEntry(root, clock, {
      id: "pri-rel-new",
      kind: "decision",
      claim: "New approach.",
      relations: { supersedes: ["pri-rel-old"] },
    });
    const toHits = await recall(root, {
      relation: { kind: "supersedes", direction: "to", target: "pri-rel-new" },
    });
    assert.equal(toHits.total, 1);
    assert.equal(toHits.hits[0]?.id, "pri-rel-old");
  });
});

test("recall respects limit and reports total separately", async () => {
  await withTempStore(async (root, clock) => {
    for (let i = 0; i < 5; i++) {
      await seedEntry(root, clock, {
        id: `pri-lim-${i}`,
        kind: "constraint",
        claim: `Constraint #${i} mentions widget`,
      });
    }
    const result = await recall(root, { query: "widget", limit: 2 });
    assert.equal(result.total, 5);
    assert.equal(result.hits.length, 2);
  });
});

test("recall filters by as_of date range", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-old",
      kind: "decision",
      claim: "Old decision.",
      as_of: "2026-01-01",
    });
    await seedEntry(root, clock, {
      id: "pri-new",
      kind: "decision",
      claim: "New decision.",
      as_of: "2026-04-26",
    });
    const after = await recall(root, { as_of_after: "2026-02-01" });
    assert.deepEqual(after.hits.map((h) => h.id), ["pri-new"]);
    const before = await recall(root, { as_of_before: "2026-02-01" });
    assert.deepEqual(before.hits.map((h) => h.id), ["pri-old"]);
  });
});
