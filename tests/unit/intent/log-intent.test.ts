import test from "node:test";
import assert from "node:assert/strict";
import { detectLogIntent } from "../../../src/intent/log-intent.ts";

test("detectLogIntent: high-confidence log this", () => {
  const r = detectLogIntent("hey, log this please: we picked X over Y");
  assert.equal(r.matched, true);
  if (r.matched) {
    assert.equal(r.suggestedKind, "note");
    assert.equal(r.strength, "high");
    assert.equal(r.ruleAssertion, false);
  }
});

test("detectLogIntent: rule assertion outranks generic log", () => {
  const r = detectLogIntent("This is a rule: never commit secrets to public repos.");
  assert.equal(r.matched, true);
  if (r.matched) {
    assert.equal(r.suggestedKind, "rule");
    assert.equal(r.ruleAssertion, true);
    assert.equal(r.strength, "high");
  }
});

test("detectLogIntent: failure phrasing", () => {
  const r = detectLogIntent("we tried this and it failed when the cache invalidated");
  assert.equal(r.matched, true);
  if (r.matched) {
    assert.equal(r.suggestedKind, "failure");
  }
});

test("detectLogIntent: constraint phrasing", () => {
  const r = detectLogIntent("this is a constraint — always do this when migrating tables");
  assert.equal(r.matched, true);
  if (r.matched) {
    // "always do this" matches constraint trigger; either constraint or rule is acceptable for our purposes
    assert.ok(r.suggestedKind === "constraint" || r.suggestedKind === "rule", `got ${r.suggestedKind}`);
  }
});

test("detectLogIntent: decision phrasing", () => {
  const r = detectLogIntent("we decided to use Postgres over Redis");
  assert.equal(r.matched, true);
  if (r.matched) {
    assert.equal(r.suggestedKind, "decision");
  }
});

test("detectLogIntent: neutral chat does not match", () => {
  assert.equal(detectLogIntent("can you help me debug this function").matched, false);
  assert.equal(detectLogIntent("what does the recall command do?").matched, false);
});

test("detectLogIntent: case-insensitive", () => {
  const r = detectLogIntent("LOG THIS");
  assert.equal(r.matched, true);
});

test("detectLogIntent: future-agent phrasing matches", () => {
  const r = detectLogIntent("make sure future agents remember this carefully");
  assert.equal(r.matched, true);
  if (r.matched) assert.equal(r.strength, "high");
});

test("detectLogIntent: do not let this happen again → failure", () => {
  const r = detectLogIntent("don't let this happen again — the migration broke prod");
  assert.equal(r.matched, true);
  if (r.matched) assert.equal(r.suggestedKind, "failure");
});
