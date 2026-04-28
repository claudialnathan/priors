import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { withTempStore } from "../../helpers/temp-store.ts";
import {
  readConfig,
  writeConfig,
  setMode,
  DEFAULT_CONFIG,
  PRIORS_MODES,
  configPath,
} from "../../../src/store/config.ts";

test("PRIORS_MODES enumerates the two modes", () => {
  assert.deepEqual([...PRIORS_MODES], ["auto", "manual"]);
});

test("readConfig defaults to auto", async () => {
  await withTempStore(async (root) => {
    const cfg = await readConfig(root);
    assert.equal(cfg.mode, "auto");
    assert.equal(cfg.mode, DEFAULT_CONFIG.mode);
  });
});

test("setMode persists to disk and round-trips", async () => {
  await withTempStore(async (root) => {
    const cfg = await setMode(root, "manual");
    assert.equal(cfg.mode, "manual");
    const reread = await readConfig(root);
    assert.equal(reread.mode, "manual");
  });
});

test("writeConfig orders fields stably (mode, groundingMode, commitThreshold)", async () => {
  await withTempStore(async (root) => {
    await writeConfig(root, { mode: "auto", groundingMode: "warn", commitThreshold: 0.4 });
    const text = await fs.readFile(configPath(root), "utf8");
    const modeIdx = text.indexOf('"mode"');
    const groundingIdx = text.indexOf('"groundingMode"');
    const thresholdIdx = text.indexOf('"commitThreshold"');
    assert.ok(modeIdx >= 0 && modeIdx < groundingIdx, "mode should come first");
    assert.ok(groundingIdx < thresholdIdx, "groundingMode before commitThreshold");
  });
});

test("readConfig rejects invalid mode", async () => {
  await withTempStore(async (root) => {
    await fs.mkdir(path.dirname(configPath(root)), { recursive: true });
    await fs.writeFile(configPath(root), JSON.stringify({ mode: "yes" }), "utf8");
    await assert.rejects(() => readConfig(root), /mode/);
  });
});
