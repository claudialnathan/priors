import {
  READABLE_ID_KIND_PREFIX,
  READABLE_ID_RE,
  type EntryKind,
} from "../schema/entry.ts";

export interface MinimalEntry {
  kind: EntryKind;
  readable_id?: string;
}

/**
 * Allocate the next readable id for a given kind, e.g. "D-001" / "F-014" / "R-002".
 *
 * Pure function: takes the list of already-issued readable_ids on the same kind
 * and returns the smallest unused 3-digit (zero-padded) suffix. Existing 4+
 * digit suffixes are preserved and treated as taken.
 *
 * Why readable ids exist: human-facing UX should never make users type or read
 * raw canonical ids. Canonical ids stay in metadata/export/debug.
 */
export function nextReadableId(
  kind: EntryKind,
  existing: readonly MinimalEntry[],
): string {
  const prefix = READABLE_ID_KIND_PREFIX[kind];
  const taken = new Set<number>();
  for (const e of existing) {
    if (e.kind !== kind) continue;
    if (!e.readable_id) continue;
    if (!READABLE_ID_RE.test(e.readable_id)) continue;
    if (!e.readable_id.startsWith(`${prefix}-`)) continue;
    const n = Number.parseInt(e.readable_id.slice(2), 10);
    if (Number.isFinite(n) && n > 0) taken.add(n);
  }
  let n = 1;
  while (taken.has(n)) n++;
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

/**
 * Resolve a user-supplied identifier to a canonical entry by checking both the
 * canonical id and the readable id. Returns null if no match. Comparison is
 * case-insensitive on the readable form so users can type "d-1" or "D-001".
 */
export function resolveReadable(
  query: string,
  entries: readonly { id: string; readable_id?: string; kind: EntryKind }[],
): { id: string; readable_id?: string } | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  // exact canonical match
  for (const e of entries) {
    if (e.id === trimmed) return { id: e.id, readable_id: e.readable_id };
  }
  // readable form: normalize "d-1" → "D-001"
  const normalized = normalizeReadable(trimmed);
  if (!normalized) return null;
  for (const e of entries) {
    if (e.readable_id === normalized) {
      return { id: e.id, readable_id: e.readable_id };
    }
  }
  return null;
}

export function normalizeReadable(q: string): string | null {
  const m = /^([a-zA-Z])-?(\d+)$/.exec(q.trim());
  if (!m) return null;
  const letter = m[1]!.toUpperCase();
  const num = Number.parseInt(m[2]!, 10);
  if (!Number.isFinite(num) || num <= 0) return null;
  return `${letter}-${String(num).padStart(3, "0")}`;
}
