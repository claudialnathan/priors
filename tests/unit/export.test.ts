import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  exportPack,
  importPack,
  validateExportInput,
  validateImportInput,
  type ExportManifest,
} from "../../src/export/pack.ts";
import { findEntryById } from "../../src/store/entries.ts";
import { withTempStore, seedEntry } from "../helpers/temp-store.ts";

test("validateExportInput accepts undefined and validates destination", () => {
  assert.deepEqual(validateExportInput(undefined), {});
  assert.deepEqual(validateExportInput(null), {});
  assert.throws(
    () => validateExportInput({ destination: "" }),
    /destination must be a non-empty string/,
  );
  assert.throws(
    () => validateExportInput({ random: 1 }),
    /unknown field random/,
  );
});

test("validateImportInput defaults to dry_run=true and overwrite=false", () => {
  const out = validateImportInput({ source: "/tmp/snap" });
  assert.equal(out.dry_run, true);
  assert.equal(out.overwrite, false);
  assert.throws(() => validateImportInput({}), /source is required/);
  assert.throws(
    () => validateImportInput({ source: "/x", dry_run: "yes" }),
    /dry_run must be a boolean/,
  );
});

test("exportPack writes only active entries with a sorted manifest", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-active-1",
      kind: "decision",
      claim: "First active decision.",
    });
    await seedEntry(root, clock, {
      id: "pri-active-0",
      kind: "constraint",
      claim: "An active constraint.",
    });
    await seedEntry(root, clock, {
      id: "pri-stale",
      kind: "decision",
      claim: "Stale and excluded from export.",
      status: "stale",
      stale_reason: "no longer applicable",
    });

    const dest = await fs.mkdtemp(path.join(os.tmpdir(), "priors-export-"));
    try {
      const result = await exportPack(root, { destination: dest }, { clock });
      assert.equal(result.written, 2);
      assert.deepEqual(
        result.manifest.entries.map((e) => e.id),
        ["pri-active-0", "pri-active-1"],
      );
      const manifest = JSON.parse(
        await fs.readFile(path.join(dest, "manifest.json"), "utf8"),
      ) as ExportManifest;
      assert.equal(manifest.schema_version, 1);
      assert.equal(manifest.entries.length, 2);
      const file = await fs.readFile(
        path.join(dest, "entries", "decisions", "pri-active-1.md"),
        "utf8",
      );
      assert.match(file, /id: pri-active-1/);
    } finally {
      await fs.rm(dest, { recursive: true, force: true });
    }
  });
});

test("importPack defaults to dry-run, then applies on demand and respects overwrite", async () => {
  await withTempStore(async (sourceRoot, clock) => {
    await seedEntry(sourceRoot, clock, {
      id: "pri-export-1",
      kind: "decision",
      claim: "Decision exported.",
    });
    const dest = await fs.mkdtemp(path.join(os.tmpdir(), "priors-export-"));
    try {
      await exportPack(sourceRoot, { destination: dest }, { clock });

      await withTempStore(async (importerRoot, importerClock) => {
        const dry = await importPack(
          importerRoot,
          { source: dest },
          { clock: importerClock },
        );
        assert.equal(dry.applied, false);
        assert.equal(dry.plan.to_add.length, 1);
        assert.equal(dry.added, 0);
        assert.equal(await findEntryById(importerRoot, "pri-export-1"), null);

        const applied = await importPack(
          importerRoot,
          { source: dest, dry_run: false },
          { clock: importerClock },
        );
        assert.equal(applied.applied, true);
        assert.equal(applied.added, 1);
        assert.ok(await findEntryById(importerRoot, "pri-export-1"));

        const reapply = await importPack(
          importerRoot,
          { source: dest, dry_run: false, overwrite: false },
          { clock: importerClock },
        );
        assert.equal(reapply.added, 0);
        assert.deepEqual(reapply.plan.to_skip[0]?.reason, "exists");

        const overwrite = await importPack(
          importerRoot,
          { source: dest, dry_run: false, overwrite: true },
          { clock: importerClock },
        );
        assert.equal(overwrite.applied, true);
        assert.equal(overwrite.overwritten, 1);
      });
    } finally {
      await fs.rm(dest, { recursive: true, force: true });
    }
  });
});

test("importPack rejects an unknown manifest schema_version", async () => {
  await withTempStore(async (root) => {
    const dest = await fs.mkdtemp(path.join(os.tmpdir(), "priors-bad-export-"));
    try {
      await fs.writeFile(
        path.join(dest, "manifest.json"),
        JSON.stringify({ schema_version: 99, project_id: "x", project_name: "x", generated_at: "2026-04-26T00:00:00Z", entries: [] }),
      );
      await assert.rejects(
        () => importPack(root, { source: dest, dry_run: false }),
        /unsupported manifest schema_version 99/,
      );
    } finally {
      await fs.rm(dest, { recursive: true, force: true });
    }
  });
});
