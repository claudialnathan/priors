import test from "node:test";
import assert from "node:assert/strict";
import {
  nextReadableId,
  resolveReadable,
  normalizeReadable,
} from "../../../src/util/readable-id.ts";

test("nextReadableId: starts at 001 when none exist", () => {
  assert.equal(nextReadableId("decision", []), "D-001");
  assert.equal(nextReadableId("rule", []), "R-001");
  assert.equal(nextReadableId("failure", []), "F-001");
});

test("nextReadableId: skips taken numbers", () => {
  const existing = [
    { kind: "decision" as const, readable_id: "D-001" },
    { kind: "decision" as const, readable_id: "D-003" },
    { kind: "decision" as const, readable_id: "D-007" },
  ];
  assert.equal(nextReadableId("decision", existing), "D-002");
});

test("nextReadableId: ignores other-kind entries", () => {
  const existing = [
    { kind: "rule" as const, readable_id: "R-001" },
    { kind: "rule" as const, readable_id: "R-002" },
  ];
  assert.equal(nextReadableId("decision", existing), "D-001");
});

test("nextReadableId: ignores entries without readable_id", () => {
  const existing = [
    { kind: "decision" as const },
    { kind: "decision" as const, readable_id: "D-001" },
  ];
  assert.equal(nextReadableId("decision", existing), "D-002");
});

test("normalizeReadable: D-1 → D-001, d1 → D-001", () => {
  assert.equal(normalizeReadable("D-1"), "D-001");
  assert.equal(normalizeReadable("d1"), "D-001");
  assert.equal(normalizeReadable("R-002"), "R-002");
  assert.equal(normalizeReadable("f-014"), "F-014");
});

test("normalizeReadable: rejects junk", () => {
  assert.equal(normalizeReadable("xyz"), null);
  assert.equal(normalizeReadable("D-"), null);
  assert.equal(normalizeReadable(""), null);
});

test("resolveReadable: matches canonical id", () => {
  const entries = [
    { id: "rule-20260428-r-001", readable_id: "R-001", kind: "rule" as const },
  ];
  const r = resolveReadable("rule-20260428-r-001", entries);
  assert.deepEqual(r, { id: "rule-20260428-r-001", readable_id: "R-001" });
});

test("resolveReadable: matches readable id with normalisation", () => {
  const entries = [
    { id: "rule-20260428-r-001", readable_id: "R-001", kind: "rule" as const },
  ];
  const r = resolveReadable("r-1", entries);
  assert.deepEqual(r, { id: "rule-20260428-r-001", readable_id: "R-001" });
});

test("resolveReadable: returns null for no match", () => {
  assert.equal(resolveReadable("Z-999", [{ id: "x", readable_id: "D-001", kind: "decision" }]), null);
});
