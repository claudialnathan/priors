import { test } from "node:test";
import assert from "node:assert/strict";
import { newUuid, isUuid } from "../../../src/util/uuid.ts";

test("newUuid returns a syntactically valid v4-shape uuid", () => {
  const id = newUuid();
  assert.equal(isUuid(id), true);
  assert.equal(id.length, 36);
  assert.equal(id[8], "-");
  assert.equal(id[13], "-");
  assert.equal(id[18], "-");
  assert.equal(id[23], "-");
});

test("newUuid produces distinct values across calls", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 32; i++) seen.add(newUuid());
  assert.equal(seen.size, 32);
});

test("isUuid accepts canonical lowercase and uppercase forms", () => {
  assert.equal(isUuid("00000000-0000-0000-0000-000000000000"), true);
  assert.equal(isUuid("ABCDEF12-1234-5678-9ABC-DEF012345678"), true);
});

test("isUuid rejects malformed input", () => {
  assert.equal(isUuid(""), false);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid("0000-0000-0000-0000-0000"), false);
  assert.equal(isUuid("00000000-0000-0000-0000-00000000000"), false);
  assert.equal(isUuid(123 as unknown), false);
  assert.equal(isUuid(undefined), false);
});
