import test from "node:test";
import assert from "node:assert/strict";
import {
  classifySignificance,
  type SignificanceCandidate,
} from "../../../src/intent/significance.ts";

const base = (overrides: Partial<SignificanceCandidate> = {}): SignificanceCandidate => ({
  claim: "Use Postgres for the primary store; Redis is cache-only.",
  kind: "decision",
  signals: {},
  ...overrides,
});

test("classifySignificance: empty claim → skip", () => {
  const r = classifySignificance(base({ claim: "" }));
  assert.equal(r.decision, "skip");
});

test("classifySignificance: noise pattern → skip", () => {
  for (const c of ["ok", "thanks", "yep", "got it", "let me think"]) {
    const r = classifySignificance(base({ claim: c }));
    assert.equal(r.decision, "skip", `expected skip for "${c}"`);
  }
});

test("classifySignificance: user-explicit → log", () => {
  const r = classifySignificance(base({ signals: { userExplicit: true } }));
  assert.equal(r.decision, "log");
});

test("classifySignificance: user-authored rule → log", () => {
  const r = classifySignificance(
    base({ kind: "rule", signals: { userAuthoredRule: true } }),
  );
  assert.equal(r.decision, "log");
});

test("classifySignificance: failure with evidence → propose", () => {
  const r = classifySignificance(
    base({
      kind: "failure",
      claim: "Migration broke when we ran ALTER TABLE without a CONCURRENTLY clause.",
      signals: { hasEvidence: true },
    }),
  );
  assert.equal(r.decision, "propose");
});

test("classifySignificance: weak signal + no evidence → skip", () => {
  const r = classifySignificance(
    base({
      claim: "We talked about caching strategies for a while.",
      signals: {},
    }),
  );
  assert.equal(r.decision, "skip");
});

test("classifySignificance: superseding decision at checkpoint with evidence → propose", () => {
  const r = classifySignificance(
    base({
      claim: "We are switching from Redis to in-process LRU for hot-path caching.",
      kind: "decision",
      signals: { superseded: true, preCommit: true, hasEvidence: true },
    }),
  );
  assert.equal(r.decision, "propose");
});

test("classifySignificance: 'future agents should know' boosts strength", () => {
  const r = classifySignificance(
    base({
      claim: "Future agents should not retry the chunked-upload path on 5xx without backoff.",
      signals: { hasEvidence: true, sessionEnd: true },
    }),
  );
  assert.equal(r.decision, "propose");
});
