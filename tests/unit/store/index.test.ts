import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { regenerateIndex } from "../../../src/store/index.ts";
import { indexAllPath } from "../../../src/store/paths.ts";
import { withTempStore, seedEntry } from "../../helpers/temp-store.ts";

test("regenerateIndex writes a stable JSON document with sorted entries", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-idx-b",
      kind: "constraint",
      claim: "B constraint",
    });
    await seedEntry(root, clock, {
      id: "pri-idx-a",
      kind: "decision",
      claim: "A decision",
    });
    const doc = await regenerateIndex(root, { clock });
    assert.equal(doc.schema_version, 1);
    assert.equal(doc.entries.length, 2);
    assert.deepEqual(
      doc.entries.map((e) => e.id),
      ["pri-idx-a", "pri-idx-b"],
    );
    assert.equal(doc.counts.active, 2);
    assert.equal(doc.counts.by_kind.decision, 1);
    assert.equal(doc.counts.by_kind.constraint, 1);
    const text = await fs.readFile(indexAllPath(root), "utf8");
    assert.ok(text.endsWith("\n"));
    const headerLine = text.split("\n")[0];
    assert.equal(headerLine, "{");
    const parsed = JSON.parse(text);
    assert.deepEqual(Object.keys(parsed), [
      "schema_version",
      "project_id",
      "generated_at",
      "entries",
      "counts",
    ]);
  });
});

test("regenerateIndex is byte-identical for identical store state", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-bytes-1",
      kind: "decision",
      claim: "First decision.",
    });
    await seedEntry(root, clock, {
      id: "pri-bytes-2",
      kind: "decision",
      claim: "Second decision.",
    });
    await regenerateIndex(root, { clock });
    const a = await fs.readFile(indexAllPath(root), "utf8");
    await regenerateIndex(root, { clock });
    const b = await fs.readFile(indexAllPath(root), "utf8");
    assert.equal(a, b, "regenerated index must be byte-identical");
  });
});

test("regenerateIndex tracks staged separately from active counts", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-cnt-active",
      kind: "decision",
      claim: "An active decision.",
    });
    await seedEntry(root, clock, {
      id: "pri-cnt-staged",
      kind: "decision",
      claim: "A staged candidate.",
      staged: true,
    });
    const doc = await regenerateIndex(root, { clock });
    assert.equal(doc.counts.active, 1);
    assert.equal(doc.counts.staged, 1);
    assert.equal(doc.entries.length, 1, "staged entries must not appear in entries[]");
  });
});

test("regenerateIndex counts non-active statuses (stale, contested, superseded)", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-stale-1",
      kind: "decision",
      claim: "Stale decision.",
      status: "stale",
    });
    await seedEntry(root, clock, {
      id: "pri-cont-1",
      kind: "decision",
      claim: "Contested decision.",
      status: "contested",
    });
    await seedEntry(root, clock, {
      id: "pri-sup-1",
      kind: "decision",
      claim: "Superseded decision.",
      status: "superseded",
    });
    const doc = await regenerateIndex(root, { clock });
    assert.equal(doc.counts.active, 0);
    assert.equal(doc.counts.stale, 1);
    assert.equal(doc.counts.contested, 1);
    assert.equal(doc.counts.superseded, 1);
  });
});
