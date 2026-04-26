import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  isSafeId,
  assertSafeId,
  resolveInside,
} from "../../../src/util/safe-path.ts";

test("isSafeId accepts allowed shapes", () => {
  assert.equal(isSafeId("a"), true);
  assert.equal(isSafeId("pri-20260426-foo"), true);
  assert.equal(isSafeId("0bad"), true);
  assert.equal(isSafeId("a".repeat(128)), true);
});

test("isSafeId rejects empty, uppercase, traversal, separators, and length overflow", () => {
  assert.equal(isSafeId(""), false);
  assert.equal(isSafeId("Foo"), false);
  assert.equal(isSafeId("../etc/passwd"), false);
  assert.equal(isSafeId("a/b"), false);
  assert.equal(isSafeId("a b"), false);
  assert.equal(isSafeId("-leading-dash"), false);
  assert.equal(isSafeId("a".repeat(129)), false);
  assert.equal(isSafeId(123 as unknown), false);
  assert.equal(isSafeId(null), false);
});

test("assertSafeId throws with helpful label", () => {
  assert.throws(() => assertSafeId("Bad", "entry id"), /entry id/);
  assert.equal(assertSafeId("ok-id"), "ok-id");
});

test("resolveInside accepts a valid relative path under root", () => {
  const root = path.resolve("/tmp/test-priors-root");
  const resolved = resolveInside(root, "entries/decisions/foo.md");
  assert.equal(resolved, path.join(root, "entries/decisions/foo.md"));
});

test("resolveInside rejects parent traversal", () => {
  const root = path.resolve("/tmp/test-priors-root");
  assert.throws(() => resolveInside(root, "../escape.md"), /escapes/);
  assert.throws(
    () => resolveInside(root, "entries/../../escape.md"),
    /escapes/,
  );
});

test("resolveInside rejects absolute paths", () => {
  const root = path.resolve("/tmp/test-priors-root");
  assert.throws(() => resolveInside(root, "/etc/passwd"), /absolute/);
});

test("resolveInside rejects empty/non-string input", () => {
  const root = path.resolve("/tmp/test-priors-root");
  assert.throws(() => resolveInside(root, ""), /non-empty/);
  assert.throws(
    () => resolveInside(root, undefined as unknown as string),
    /non-empty/,
  );
});
