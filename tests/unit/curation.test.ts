import { test } from "node:test";
import assert from "node:assert/strict";
import {
  linkEntries,
  markStale,
  validateLinkInput,
  validateMarkStaleInput,
} from "../../src/curation/curation.ts";
import { findEntryById } from "../../src/store/entries.ts";
import { withTempStore, seedEntry } from "../helpers/temp-store.ts";

test("validateLinkInput rejects unknown fields and bad ids", () => {
  assert.throws(() => validateLinkInput("nope"), /must be an object/);
  assert.throws(
    () => validateLinkInput({ source_id: "pri-a", target_id: "pri-b", relation: "merges" }),
    /relation must be one of/,
  );
  assert.throws(
    () => validateLinkInput({ source_id: "..", target_id: "pri-b", relation: "supersedes" }),
    /source_id is required/,
  );
});

test("validateMarkStaleInput requires non-empty reason", () => {
  assert.throws(
    () => validateMarkStaleInput({ id: "pri-a", reason: "" }),
    /reason must be a non-empty string/,
  );
  assert.throws(
    () => validateMarkStaleInput({ id: "pri-a", reason: "x".repeat(501) }),
    /reason must be a non-empty string/,
  );
});

test("linkEntries with relation=supersedes flips target to superseded and is idempotent", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-old",
      kind: "decision",
      claim: "Old approach.",
    });
    await seedEntry(root, clock, {
      id: "pri-new",
      kind: "decision",
      claim: "New approach.",
    });
    const first = await linkEntries(
      root,
      { source_id: "pri-new", target_id: "pri-old", relation: "supersedes" },
      { clock },
    );
    assert.equal(first.noop, false);
    const targetAfter = await findEntryById(root, "pri-old");
    assert.equal(targetAfter?.frontmatter.status, "superseded");
    const sourceAfter = await findEntryById(root, "pri-new");
    assert.deepEqual(sourceAfter?.frontmatter.relations.supersedes, ["pri-old"]);

    const repeat = await linkEntries(
      root,
      { source_id: "pri-new", target_id: "pri-old", relation: "supersedes" },
      { clock },
    );
    assert.equal(repeat.noop, true);
  });
});

test("linkEntries with relation=contradiction_of flips both entries to contested and reciprocates", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-a",
      kind: "decision",
      claim: "Decision A.",
    });
    await seedEntry(root, clock, {
      id: "pri-b",
      kind: "decision",
      claim: "Decision B.",
    });
    const result = await linkEntries(
      root,
      { source_id: "pri-a", target_id: "pri-b", relation: "contradiction_of" },
      { clock },
    );
    assert.deepEqual(result.contested_pair, ["pri-a", "pri-b"]);
    const a = await findEntryById(root, "pri-a");
    const b = await findEntryById(root, "pri-b");
    assert.equal(a?.frontmatter.status, "contested");
    assert.equal(b?.frontmatter.status, "contested");
    assert.deepEqual(a?.frontmatter.relations.contradiction_of, ["pri-b"]);
    assert.deepEqual(b?.frontmatter.relations.contradiction_of, ["pri-a"]);
  });
});

test("linkEntries refuses self-links", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-self",
      kind: "decision",
      claim: "Self.",
    });
    await assert.rejects(
      () =>
        linkEntries(
          root,
          { source_id: "pri-self", target_id: "pri-self", relation: "reinforces" },
          { clock },
        ),
      /self-links are not allowed/,
    );
  });
});

test("linkEntries refuses to create a supersedes cycle", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-x",
      kind: "decision",
      claim: "X",
    });
    await seedEntry(root, clock, {
      id: "pri-y",
      kind: "decision",
      claim: "Y",
    });
    // x supersedes y
    await linkEntries(
      root,
      { source_id: "pri-x", target_id: "pri-y", relation: "supersedes" },
      { clock },
    );
    // y supersedes x would be a cycle
    await assert.rejects(
      () =>
        linkEntries(
          root,
          { source_id: "pri-y", target_id: "pri-x", relation: "supersedes" },
          { clock },
        ),
      /supersedes cycle/,
    );
  });
});

test("linkEntries reports missing source or target with descriptive error", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-here",
      kind: "decision",
      claim: "Here.",
    });
    await assert.rejects(
      () =>
        linkEntries(
          root,
          { source_id: "pri-missing", target_id: "pri-here", relation: "reinforces" },
          { clock },
        ),
      /source pri-missing not found/,
    );
    await assert.rejects(
      () =>
        linkEntries(
          root,
          { source_id: "pri-here", target_id: "pri-missing", relation: "reinforces" },
          { clock },
        ),
      /target pri-missing not found/,
    );
  });
});

test("markStale flips status, records reason, and is idempotent for same reason", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-fading",
      kind: "decision",
      claim: "Fading decision.",
    });
    const first = await markStale(
      root,
      { id: "pri-fading", reason: "Replaced in 2026 plan" },
      { clock },
    );
    assert.equal(first.status, "stale");
    assert.equal(first.noop, false);
    const after = await findEntryById(root, "pri-fading");
    assert.equal(after?.frontmatter.status, "stale");
    assert.equal(after?.frontmatter.stale_reason, "Replaced in 2026 plan");

    const repeat = await markStale(
      root,
      { id: "pri-fading", reason: "Replaced in 2026 plan" },
      { clock },
    );
    assert.equal(repeat.noop, true);
  });
});

test("markStale rejects unknown ids", async () => {
  await withTempStore(async (root, clock) => {
    await assert.rejects(
      () => markStale(root, { id: "pri-nope", reason: "Reason." }, { clock }),
      /not found/,
    );
  });
});
