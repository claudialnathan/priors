import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLAIM_MAX,
  ENTRY_CONFIDENCES,
  ENTRY_KINDS,
  ENTRY_STATUSES,
  emptyRelations,
  validateEntryFrontmatter,
} from "../../../src/schema/entry.ts";

function base(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "pri-foo",
    kind: "decision",
    status: "active",
    confidence: "high",
    as_of: "2026-04-26",
    created_at: "2026-04-26T00:00:00Z",
    updated_at: "2026-04-26T00:00:00Z",
    claim: "Use TypeScript on Node 25.",
    relations: emptyRelations(),
    tags: [],
    ...overrides,
  };
}

test("ENTRY constants list canonical values", () => {
  assert.deepEqual([...ENTRY_KINDS], [
    "decision",
    "failure",
    "constraint",
    "pattern",
    "question",
    "hypothesis",
    "rule",
  ]);
  assert.deepEqual([...ENTRY_STATUSES], [
    "active",
    "stale",
    "superseded",
    "contested",
    "action_pending",
  ]);
  assert.deepEqual([...ENTRY_CONFIDENCES], ["high", "medium", "low"]);
});

test("validateEntryFrontmatter accepts a fully-formed entry", () => {
  const r = validateEntryFrontmatter(base());
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.id, "pri-foo");
    assert.equal(r.value.kind, "decision");
    assert.deepEqual(r.value.relations, emptyRelations());
  }
});

test("validateEntryFrontmatter rejects unknown frontmatter keys", () => {
  const r = validateEntryFrontmatter(base({ extra: "nope" }));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.errors.some((e) => /unknown frontmatter key: extra/.test(e)));
  }
});

test("validateEntryFrontmatter rejects bad id, kind, status, confidence", () => {
  const r = validateEntryFrontmatter(
    base({
      id: "BadID",
      kind: "user-preference",
      status: "deleted",
      confidence: "medium-high",
    }),
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.errors.some((e) => /id must match/.test(e)));
    assert.ok(r.errors.some((e) => /kind must be one of/.test(e)));
    assert.ok(r.errors.some((e) => /status must be one of/.test(e)));
    assert.ok(r.errors.some((e) => /confidence must be one of/.test(e)));
  }
});

test("validateEntryFrontmatter enforces ISO date and datetime formats", () => {
  const r = validateEntryFrontmatter(
    base({
      as_of: "26-04-2026",
      created_at: "2026-04-26 00:00:00",
      updated_at: "2026-04-26T00:00:00+00:00",
    }),
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.errors.some((e) => /as_of must be an ISO date/.test(e)));
    assert.ok(r.errors.some((e) => /created_at must be an ISO 8601 datetime/.test(e)));
    assert.ok(r.errors.some((e) => /updated_at must be an ISO 8601 datetime/.test(e)));
  }
});

test("validateEntryFrontmatter enforces non-empty claim under CLAIM_MAX", () => {
  const empty = validateEntryFrontmatter(base({ claim: "   " }));
  assert.equal(empty.ok, false);
  const tooLong = validateEntryFrontmatter(
    base({ claim: "x".repeat(CLAIM_MAX + 1) }),
  );
  assert.equal(tooLong.ok, false);
  if (!tooLong.ok) {
    assert.ok(tooLong.errors.some((e) => /≤ 280 characters/.test(e)));
  }
});

test("validateEntryFrontmatter validates relations object and ids", () => {
  const r = validateEntryFrontmatter(
    base({
      relations: {
        supersedes: ["pri-ok"],
        contradiction_of: ["BadRef"],
        reinforces: ["pri-ok-2"],
        derived_from: [],
        bogus: [],
      },
    }),
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.errors.some((e) => /unknown relations key: bogus/.test(e)));
    assert.ok(
      r.errors.some((e) =>
        /relations.contradiction_of contains invalid id: BadRef/.test(e),
      ),
    );
  }
});

test("validateEntryFrontmatter accepts optional source_ref and stale_reason", () => {
  const r = validateEntryFrontmatter(
    base({
      source_ref: "session://abc",
      stale_reason: "Replaced by v2 plan.",
    }),
  );
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.source_ref, "session://abc");
    assert.equal(r.value.stale_reason, "Replaced by v2 plan.");
  }
});

test("validateEntryFrontmatter rejects non-list relations and tags", () => {
  const r = validateEntryFrontmatter(
    base({
      relations: { supersedes: "pri-ok" },
      tags: "alpha,beta",
    }),
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.errors.some((e) => /relations.supersedes must be a list/.test(e)));
    assert.ok(r.errors.some((e) => /tags must be a list/.test(e)));
  }
});

test("validateEntryFrontmatter rejects non-object root", () => {
  assert.equal(validateEntryFrontmatter(null).ok, false);
  assert.equal(validateEntryFrontmatter([]).ok, false);
  assert.equal(validateEntryFrontmatter("nope").ok, false);
});
