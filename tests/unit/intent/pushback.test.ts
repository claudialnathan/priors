import test from "node:test";
import assert from "node:assert/strict";
import {
  formatPushback,
  formatEntryReference,
} from "../../../src/intent/pushback.ts";

test("formatPushback: canonical shape with one prior", () => {
  const out = formatPushback({
    attempt: "we reviewed the human-invoked entry flow",
    outcome: "users were treating Priors like database admin instead of agent memory",
    date: "2026-04-28",
    priors: [
      {
        reference: "F-004",
        title: "UUID-facing retrieval is unacceptable UX",
        kind: "failure",
        date: "2026-04-28",
      },
    ],
    alternative: "keeping IDs internal and exposing /recall, /why, /review, and readable references",
  });

  assert.match(out, /^This approach has been tried and rejected\.$/m);
  assert.match(out, /On 2026-04-28, we reviewed the human-invoked entry flow,/);
  assert.match(out, /which led to users were treating Priors like database admin/);
  assert.match(out, /Relevant prior:/);
  assert.match(out, /- F-004: UUID-facing retrieval is unacceptable UX$/m);
  assert.match(out, /^I recommend keeping IDs internal/m);
});

test("formatPushback: multiple priors render as bullets", () => {
  const out = formatPushback({
    attempt: "we proposed a vector store",
    outcome: "the spec was reverted within a week",
    date: "2026-04-15",
    priors: [
      {
        reference: "F-002",
        title: "Vector store ratholed scope",
        kind: "failure",
        date: "2026-04-15",
      },
      {
        reference: "R-001",
        title: "Files-only store",
        kind: "rule",
        date: "2026-04-01",
      },
    ],
    alternative: "plain-text recall over the index",
  });

  assert.match(out, /- F-002: Vector store ratholed scope/);
  assert.match(out, /- R-001: Files-only store/);
});

test("formatPushback: rejects empty priors list", () => {
  assert.throws(() =>
    formatPushback({
      attempt: "x",
      outcome: "y",
      date: "2026-04-28",
      priors: [],
      alternative: "z",
    }),
  );
});

test("formatEntryReference: renders readable id, title, date, consequence", () => {
  const out = formatEntryReference({
    reference: "F-004",
    title: "Manual UUID retrieval made the UX unusable",
    kind: "failure",
    date: "2026-04-28",
    consequence: "Future agents should avoid human-facing flows that require raw entry IDs.",
  });
  assert.match(out, /^F-004 — Manual UUID retrieval made the UX unusable$/m);
  assert.match(out, /^Date: 2026-04-28$/m);
  assert.match(out, /^Consequence: Future agents should avoid/m);
});
