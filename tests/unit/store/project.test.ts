import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initProject, readProject, requireProject } from "../../../src/store/project.ts";
import {
  auditDir,
  entriesDir,
  exportsDir,
  indexesDir,
  priorsRoot,
  projectJson,
  stagedDir,
} from "../../../src/store/paths.ts";
import { fixedClock } from "../../../src/util/clock.ts";
import { isUuid } from "../../../src/util/uuid.ts";

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "priors-store-"));
}

test("initProject creates the canonical .priors directory layout", async () => {
  const root = await tempRoot();
  try {
    const clock = fixedClock("2026-04-26T00:00:00Z");
    const meta = await initProject(root, { name: "demo", clock });
    assert.equal(meta.name, "demo");
    assert.equal(meta.schema_version, 1);
    assert.equal(isUuid(meta.id), true);
    assert.equal(meta.created_at, "2026-04-26T00:00:00.000Z");

    const required = [
      priorsRoot(root),
      entriesDir(root),
      stagedDir(root),
      indexesDir(root),
      auditDir(root),
      exportsDir(root),
    ];
    for (const dir of required) {
      const stat = await fs.stat(dir);
      assert.ok(stat.isDirectory(), `${dir} should be a directory`);
    }
    const projectFileText = await fs.readFile(projectJson(root), "utf8");
    assert.ok(projectFileText.endsWith("\n"), "project.json should end with newline");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("initProject is idempotent and preserves the original UUID and created_at", async () => {
  const root = await tempRoot();
  try {
    const clock1 = fixedClock("2026-04-26T00:00:00Z");
    const first = await initProject(root, { name: "demo", clock: clock1 });
    const clock2 = fixedClock("2027-01-01T00:00:00Z");
    const second = await initProject(root, { name: "renamed", clock: clock2 });
    assert.equal(second.id, first.id);
    assert.equal(second.created_at, first.created_at);
    assert.equal(second.name, first.name, "name should not change without --force");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("initProject({ force }) keeps the existing UUID/created_at but rewrites metadata", async () => {
  const root = await tempRoot();
  try {
    const clock = fixedClock("2026-04-26T00:00:00Z");
    const first = await initProject(root, { name: "demo", clock });
    const forced = await initProject(root, {
      name: "renamed",
      clock,
      force: true,
    });
    assert.equal(forced.id, first.id);
    assert.equal(forced.created_at, first.created_at);
    assert.equal(forced.name, "renamed");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("readProject returns null when no .priors store exists", async () => {
  const root = await tempRoot();
  try {
    const meta = await readProject(root);
    assert.equal(meta, null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("requireProject throws a helpful error when uninitialized", async () => {
  const root = await tempRoot();
  try {
    await assert.rejects(() => requireProject(root), /no \.priors store found/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("readProject rejects malformed project.json", async () => {
  const root = await tempRoot();
  try {
    await fs.mkdir(priorsRoot(root), { recursive: true });
    await fs.writeFile(
      projectJson(root),
      JSON.stringify({ id: "not-a-uuid", name: 1 }),
    );
    await assert.rejects(() => readProject(root), /invalid project.json/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
