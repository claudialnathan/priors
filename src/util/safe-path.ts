import path from "node:path";

const SAFE_ID_RE = /^[a-z0-9][a-z0-9-]{0,127}$/;

export function isSafeId(id: unknown): id is string {
  return typeof id === "string" && SAFE_ID_RE.test(id);
}

export function assertSafeId(id: unknown, label = "id"): string {
  if (!isSafeId(id)) {
    throw new Error(
      `${label} must match ^[a-z0-9][a-z0-9-]{0,127}$ (got ${JSON.stringify(id)})`,
    );
  }
  return id;
}

/**
 * Resolve `relative` against `root` and ensure the result stays inside `root`.
 * Rejects absolute paths, parent traversal, and any normalized path that escapes root.
 */
export function resolveInside(root: string, relative: string): string {
  if (typeof relative !== "string" || relative.length === 0) {
    throw new Error("relative path must be a non-empty string");
  }
  if (path.isAbsolute(relative)) {
    throw new Error(`absolute paths are not allowed (got ${relative})`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  const rel = path.relative(resolvedRoot, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`path escapes store root: ${relative}`);
  }
  return resolved;
}
