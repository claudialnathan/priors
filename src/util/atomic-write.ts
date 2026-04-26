import fs from "node:fs/promises";
import path from "node:path";

/**
 * Write `data` to `target` atomically by writing to a temp file in the same
 * directory and renaming it. The rename is atomic on POSIX filesystems.
 */
export async function atomicWrite(
  target: string,
  data: string | Uint8Array,
): Promise<void> {
  const dir = path.dirname(target);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(target)}.${process.pid}.tmp`);
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, target);
}

export async function ensureDir(target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
}

export async function appendLine(target: string, line: string): Promise<void> {
  await ensureDir(path.dirname(target));
  await fs.appendFile(target, line.endsWith("\n") ? line : `${line}\n`);
}
