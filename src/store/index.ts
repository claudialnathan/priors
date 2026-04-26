import { atomicWrite } from "../util/atomic-write.ts";
import { isoDatetime, systemClock, type Clock } from "../util/clock.ts";
import { ENTRY_KINDS, type EntryKind } from "../schema/entry.ts";
import {
  indexAllPath,
  relativeFromPriors,
} from "./paths.ts";
import {
  listEntries,
  listStagedEntries,
  type LoadedEntry,
} from "./entries.ts";
import { requireProject } from "./project.ts";

export interface IndexEntryRow {
  id: string;
  kind: EntryKind;
  claim: string;
  status: string;
  confidence: string;
  as_of: string;
  updated_at: string;
  path: string;
}

export interface IndexCounts {
  active: number;
  staged: number;
  superseded: number;
  stale: number;
  contested: number;
  by_kind: Record<EntryKind, number>;
}

export interface IndexDocument {
  schema_version: 1;
  project_id: string;
  generated_at: string;
  entries: IndexEntryRow[];
  counts: IndexCounts;
}

export function buildIndex(
  projectRoot: string,
  projectId: string,
  active: LoadedEntry[],
  staged: LoadedEntry[],
  generatedAt: string,
): IndexDocument {
  const rows: IndexEntryRow[] = active
    .map((entry) => ({
      id: entry.frontmatter.id,
      kind: entry.frontmatter.kind,
      claim: entry.frontmatter.claim,
      status: entry.frontmatter.status,
      confidence: entry.frontmatter.confidence,
      as_of: entry.frontmatter.as_of,
      updated_at: entry.frontmatter.updated_at,
      path: relativeFromPriors(projectRoot, entry.location.filePath),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const byKind: Record<EntryKind, number> = {
    decision: 0,
    failure: 0,
    constraint: 0,
    pattern: 0,
    question: 0,
    hypothesis: 0,
  };
  let activeCount = 0;
  let supersededCount = 0;
  let staleCount = 0;
  let contestedCount = 0;

  for (const e of active) {
    byKind[e.frontmatter.kind]++;
    switch (e.frontmatter.status) {
      case "active":
        activeCount++;
        break;
      case "superseded":
        supersededCount++;
        break;
      case "stale":
        staleCount++;
        break;
      case "contested":
        contestedCount++;
        break;
      case "action_pending":
        activeCount++;
        break;
    }
  }

  return {
    schema_version: 1,
    project_id: projectId,
    generated_at: generatedAt,
    entries: rows,
    counts: {
      active: activeCount,
      staged: staged.length,
      superseded: supersededCount,
      stale: staleCount,
      contested: contestedCount,
      by_kind: byKind,
    },
  };
}

export async function regenerateIndex(
  projectRoot: string,
  opts: { clock?: Clock } = {},
): Promise<IndexDocument> {
  const clock = opts.clock ?? systemClock;
  const meta = await requireProject(projectRoot);
  const active = await listEntries(projectRoot);
  const staged = await listStagedEntries(projectRoot);
  const generatedAt = isoDatetime(clock.now());
  const doc = buildIndex(projectRoot, meta.id, active, staged, generatedAt);
  await atomicWrite(indexAllPath(projectRoot), `${stableJson(doc)}\n`);
  return doc;
}

/**
 * Stringify a JSON document with stable key ordering to keep the index
 * file byte-identical for identical store state. JS preserves insertion
 * order so we walk objects with a fixed key list per shape.
 */
function stableJson(value: unknown): string {
  return JSON.stringify(orderForStable(value), null, 2);
}

function orderForStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(orderForStable);
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    if ("schema_version" in obj) {
      const order = [
        "schema_version",
        "project_id",
        "generated_at",
        "entries",
        "counts",
      ];
      for (const k of order) if (k in obj) out[k] = orderForStable(obj[k]);
      for (const k of Object.keys(obj))
        if (!order.includes(k)) out[k] = orderForStable(obj[k]);
      return out;
    }
    if (
      "id" in obj &&
      "kind" in obj &&
      "claim" in obj &&
      "status" in obj &&
      "path" in obj
    ) {
      const order = [
        "id",
        "kind",
        "claim",
        "status",
        "confidence",
        "as_of",
        "updated_at",
        "path",
      ];
      for (const k of order) if (k in obj) out[k] = orderForStable(obj[k]);
      return out;
    }
    if ("by_kind" in obj) {
      const order = [
        "active",
        "staged",
        "superseded",
        "stale",
        "contested",
        "by_kind",
      ];
      for (const k of order) if (k in obj) out[k] = orderForStable(obj[k]);
      return out;
    }
    if (
      "decision" in obj ||
      "constraint" in obj ||
      "failure" in obj ||
      "pattern" in obj ||
      "question" in obj ||
      "hypothesis" in obj
    ) {
      const order: EntryKind[] = [
        "decision",
        "constraint",
        "failure",
        "question",
        "pattern",
        "hypothesis",
      ];
      for (const k of order) if (k in obj) out[k] = orderForStable(obj[k]);
      for (const k of Object.keys(obj))
        if (!order.includes(k as EntryKind)) out[k] = orderForStable(obj[k]);
      return out;
    }
    for (const k of Object.keys(obj)) out[k] = orderForStable(obj[k]);
    return out;
  }
  return value;
}
