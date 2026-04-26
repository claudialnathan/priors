import { test } from "node:test";
import assert from "node:assert/strict";
import { approxTokens } from "../../../src/util/tokens.ts";

test("approxTokens returns 0 for empty/non-string", () => {
  assert.equal(approxTokens(""), 0);
  assert.equal(approxTokens(undefined as unknown as string), 0);
  assert.equal(approxTokens(null as unknown as string), 0);
});

test("approxTokens overcounts via ceil(chars/4)", () => {
  assert.equal(approxTokens("a"), 1);
  assert.equal(approxTokens("abcd"), 1);
  assert.equal(approxTokens("abcde"), 2);
  assert.equal(approxTokens("abcdefgh"), 2);
  assert.equal(approxTokens("abcdefghi"), 3);
});

test("approxTokens scales linearly with length", () => {
  const a = approxTokens("x".repeat(400));
  const b = approxTokens("x".repeat(800));
  assert.equal(a, 100);
  assert.equal(b, 200);
});
