import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  atomicWrite,
  ensureDir,
  appendLine,
} from "../../../src/util/atomic-write.ts";

async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "priors-atomic-"));
}

test("atomicWrite creates file and parent directories", async () => {
  const root = await tempDir();
  try {
    const target = path.join(root, "a", "b", "out.txt");
    await atomicWrite(target, "hello");
    const got = await fs.readFile(target, "utf8");
    assert.equal(got, "hello");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("atomicWrite overwrites existing file and leaves no .tmp behind", async () => {
  const root = await tempDir();
  try {
    const target = path.join(root, "out.txt");
    await atomicWrite(target, "v1");
    await atomicWrite(target, "v2");
    const got = await fs.readFile(target, "utf8");
    assert.equal(got, "v2");
    const dir = await fs.readdir(root);
    const stragglers = dir.filter((f) => f.includes(".tmp"));
    assert.equal(stragglers.length, 0, `tmp files left behind: ${stragglers.join(", ")}`);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("ensureDir is idempotent", async () => {
  const root = await tempDir();
  try {
    const sub = path.join(root, "x", "y");
    await ensureDir(sub);
    await ensureDir(sub);
    const stat = await fs.stat(sub);
    assert.ok(stat.isDirectory());
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("appendLine creates parent dirs and ensures trailing newline", async () => {
  const root = await tempDir();
  try {
    const target = path.join(root, "logs", "out.jsonl");
    await appendLine(target, '{"x":1}');
    await appendLine(target, '{"x":2}\n');
    const got = await fs.readFile(target, "utf8");
    assert.equal(got, '{"x":1}\n{"x":2}\n');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
