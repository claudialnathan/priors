import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fixedClock,
  isoDate,
  isoDatetime,
  systemClock,
} from "../../../src/util/clock.ts";

test("fixedClock returns the provided instant", () => {
  const c = fixedClock("2026-04-26T12:34:56Z");
  assert.equal(c.now().toISOString(), "2026-04-26T12:34:56.000Z");
});

test("fixedClock throws on bad input", () => {
  assert.throws(() => fixedClock("not-a-date"), /invalid ISO/);
});

test("systemClock returns a Date close to now", () => {
  const before = Date.now();
  const got = systemClock.now().getTime();
  const after = Date.now();
  assert.ok(got >= before && got <= after, `clock drift: ${got} not in [${before}, ${after}]`);
});

test("isoDate truncates to the date portion", () => {
  const d = new Date("2026-04-26T12:34:56Z");
  assert.equal(isoDate(d), "2026-04-26");
});

test("isoDatetime truncates milliseconds to the second", () => {
  const d = new Date("2026-04-26T12:34:56.789Z");
  assert.equal(isoDatetime(d), "2026-04-26T12:34:56.000Z");
});
