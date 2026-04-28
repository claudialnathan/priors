import test from "node:test";
import assert from "node:assert/strict";
import {
  buildImpactReport,
  renderImpactReport,
} from "../../../src/session/impact.ts";
import type { SessionEvent } from "../../../src/session/log.ts";

const ev = (
  kind: SessionEvent["kind"],
  payload: Record<string, unknown>,
): SessionEvent => ({
  ts: "2026-04-28T01:00:00Z",
  session_id: "s-1",
  kind,
  payload,
});

test("buildImpactReport: empty events → empty fields, session id (unknown)", () => {
  const r = buildImpactReport([]);
  assert.equal(r.sessionId, "(unknown)");
  assert.equal(r.recallsUsed.length, 0);
  assert.equal(r.pushbacks.length, 0);
});

test("buildImpactReport: aggregates recalls, pushbacks, candidates", () => {
  const events: SessionEvent[] = [
    ev("session_start", {}),
    ev("recall", {
      entries: [
        { reference: "F-004", title: "UUID-facing retrieval is bad" },
        { reference: "R-002", title: "No appeasement" },
      ],
    }),
    ev("pushback", {
      reference: "F-004",
      title: "UUID-facing retrieval is bad",
      reason: "user proposed canonical id retrieval",
    }),
    ev("rule_applied", { reference: "R-002", title: "No appeasement" }),
    ev("candidate_proposed", { id: "x" }),
    ev("candidate_logged", { id: "y" }),
    ev("candidate_skipped", { id: "z" }),
  ];
  const r = buildImpactReport(events);
  assert.equal(r.sessionId, "s-1");
  assert.equal(r.recallsUsed.length, 2);
  assert.equal(r.pushbacks.length, 1);
  assert.equal(r.rulesApplied.length, 1);
  assert.equal(r.candidatesProposed, 1);
  assert.equal(r.candidatesLogged, 1);
  assert.equal(r.candidatesSkipped, 1);
});

test("buildImpactReport: dedupes recall and rule references", () => {
  const events: SessionEvent[] = [
    ev("recall", { entries: [{ reference: "F-001", title: "x" }] }),
    ev("recall", { entries: [{ reference: "F-001", title: "x" }] }),
    ev("rule_applied", { reference: "R-001", title: "y" }),
    ev("rule_applied", { reference: "R-001", title: "y" }),
  ];
  const r = buildImpactReport(events);
  assert.equal(r.recallsUsed.length, 1);
  assert.equal(r.rulesApplied.length, 1);
});

test("buildImpactReport: flags possible miss when log intent had no write", () => {
  const events: SessionEvent[] = [
    ev("user_log_intent", { text: "log this" }),
    ev("user_log_intent", { text: "make it a rule" }),
  ];
  const r = buildImpactReport(events);
  assert.ok(
    r.possibleMisses.some((m) => /user log intent/i.test(m)),
    `expected miss flag, got ${JSON.stringify(r.possibleMisses)}`,
  );
});

test("renderImpactReport: includes session id in title", () => {
  const out = renderImpactReport(buildImpactReport([ev("session_start", {})]));
  assert.match(out, /Priors impact this session \(s-1\):/);
});
