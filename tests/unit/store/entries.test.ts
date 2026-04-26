import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  entryToFileText,
  findEntryById,
  listEntries,
  listStagedEntries,
  readEntryFile,
  readStagedEntry,
  writeEntry,
  writeStagedEntry,
  deleteStagedEntry,
  makeFrontmatter,
} from "../../../src/store/entries.ts";
import { entryPathFor, stagedPathFor } from "../../../src/store/paths.ts";
import { withTempStore, seedEntry } from "../../helpers/temp-store.ts";

test("writeEntry round-trips through readEntryFile", async () => {
  await withTempStore(async (root) => {
    const fm = makeFrontmatter(
      "pri-rw-1",
      "decision",
      "Use the deterministic brief assembler.",
      "2026-04-26",
      "2026-04-26T00:00:00Z",
      "2026-04-26T00:00:00Z",
      { confidence: "high", tags: ["arch"] },
    );
    const loc = await writeEntry(root, {
      frontmatter: fm,
      body: "\n## Notes\n\nDeterminism is non-negotiable.\n",
    });
    assert.equal(loc.area, "entries");
    assert.equal(loc.relativePath, "entries/decisions/pri-rw-1.md");
    const back = await readEntryFile(loc.filePath);
    assert.deepEqual(back.frontmatter, fm);
    assert.equal(back.body, "## Notes\n\nDeterminism is non-negotiable.\n");
  });
});

test("entryToFileText produces stable, parseable output", async () => {
  await withTempStore(async () => {
    const fm = makeFrontmatter(
      "pri-stable",
      "constraint",
      "Hard 2000-token brief ceiling.",
      "2026-04-26",
      "2026-04-26T00:00:00Z",
      "2026-04-26T00:00:00Z",
    );
    const text = entryToFileText({ frontmatter: fm, body: "## Notes\n" });
    assert.match(text, /^---\nid: pri-stable\nkind: constraint\n/);
    assert.ok(text.endsWith("\n## Notes\n"));
  });
});

test("listEntries sorts by id and rejects entries in the wrong directory", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-list-b",
      kind: "decision",
      claim: "B decision",
    });
    await seedEntry(root, clock, {
      id: "pri-list-a",
      kind: "constraint",
      claim: "A constraint",
    });
    const entries = await listEntries(root);
    assert.deepEqual(
      entries.map((e) => e.frontmatter.id),
      ["pri-list-a", "pri-list-b"],
    );

    const wrongPath = entryPathFor(root, "decision", "pri-list-a");
    await fs.mkdir(path.dirname(wrongPath), { recursive: true });
    await fs.copyFile(entries[0]!.location.filePath, wrongPath);
    await assert.rejects(() => listEntries(root), /pri-list-a is in directory/);
  });
});

test("findEntryById returns null for unknown ids and matches by kind", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-find",
      kind: "pattern",
      claim: "Pattern under test",
    });
    const got = await findEntryById(root, "pri-find");
    assert.ok(got);
    assert.equal(got?.frontmatter.kind, "pattern");
    const missing = await findEntryById(root, "pri-missing");
    assert.equal(missing, null);
    const unsafe = await findEntryById(root, "BAD/ID");
    assert.equal(unsafe, null);
  });
});

test("staged entries can be written, read, listed, and deleted", async () => {
  await withTempStore(async (root, clock) => {
    const fm = makeFrontmatter(
      "pri-staged-1",
      "decision",
      "Staged candidate under review.",
      "2026-04-26",
      "2026-04-26T00:00:00Z",
      "2026-04-26T00:00:00Z",
    );
    await writeStagedEntry(root, { frontmatter: fm, body: "## Notes\n" });

    const got = await readStagedEntry(root, "pri-staged-1");
    assert.ok(got);
    assert.equal(got?.location.area, "staged");

    const list = await listStagedEntries(root);
    assert.equal(list.length, 1);
    assert.equal(list[0]!.frontmatter.id, "pri-staged-1");

    const briefList = await listEntries(root);
    assert.equal(
      briefList.length,
      0,
      "active list should not include staged entries",
    );
    void clock;

    await deleteStagedEntry(root, "pri-staged-1");
    const after = await readStagedEntry(root, "pri-staged-1");
    assert.equal(after, null);
    await assert.doesNotReject(() => deleteStagedEntry(root, "pri-missing"));
  });
});

test("readEntryFile rejects malformed frontmatter with all errors", async () => {
  await withTempStore(async (root) => {
    const target = entryPathFor(root, "decision", "pri-bad");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(
      target,
      "---\nid: BAD-ID\nkind: not-a-kind\nstatus: nope\n---\n\n## body\n",
    );
    await assert.rejects(
      () => readEntryFile(target),
      /invalid entry frontmatter/,
    );
  });
});

test("readEntryFile falls back when staged file is missing", async () => {
  await withTempStore(async (root) => {
    const got = await readStagedEntry(root, "pri-missing");
    assert.equal(got, null);
    void stagedPathFor(root, "pri-missing"); // no throw
  });
});
