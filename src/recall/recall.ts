import {
  ENTRY_CONFIDENCES,
  ENTRY_KINDS,
  ENTRY_STATUSES,
  type EntryConfidence,
  type EntryKind,
  type EntryStatus,
} from "../schema/entry.ts";
import { listEntries, type LoadedEntry } from "../store/entries.ts";

export interface RecallRelationFilter {
  kind: "supersedes" | "contradicts" | "reinforces" | "derived_from";
  direction: "from" | "to";
  target: string;
}

export interface RecallInput {
  query?: string;
  kind?: EntryKind;
  status?: EntryStatus;
  confidence?: EntryConfidence;
  as_of_after?: string;
  as_of_before?: string;
  relation?: RecallRelationFilter;
  limit?: number;
}

export interface RecallHit {
  id: string;
  kind: EntryKind;
  claim: string;
  status: EntryStatus;
  confidence: EntryConfidence;
  as_of: string;
  updated_at: string;
  score: number;
  /** Path under .priors/ */
  path: string;
}

export interface RecallResult {
  total: number;
  hits: RecallHit[];
}

export function validateRecallInput(input: unknown): RecallInput {
  if (input === undefined || input === null) return {};
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("recall: input must be an object");
  }
  const r = input as Record<string, unknown>;
  const out: RecallInput = {};
  const allowed = [
    "query",
    "kind",
    "status",
    "confidence",
    "as_of_after",
    "as_of_before",
    "relation",
    "limit",
  ];
  for (const k of Object.keys(r)) {
    if (!allowed.includes(k)) throw new Error(`recall: unknown field ${k}`);
  }
  if (r["query"] !== undefined) {
    if (typeof r["query"] !== "string" || r["query"].length > 500) {
      throw new Error("recall: query must be a string ≤500 chars");
    }
    out.query = r["query"];
  }
  if (r["kind"] !== undefined) {
    if (!ENTRY_KINDS.includes(r["kind"] as EntryKind)) {
      throw new Error(
        `recall: kind must be one of ${ENTRY_KINDS.join(", ")}`,
      );
    }
    out.kind = r["kind"] as EntryKind;
  }
  if (r["status"] !== undefined) {
    if (!ENTRY_STATUSES.includes(r["status"] as EntryStatus)) {
      throw new Error(
        `recall: status must be one of ${ENTRY_STATUSES.join(", ")}`,
      );
    }
    out.status = r["status"] as EntryStatus;
  }
  if (r["confidence"] !== undefined) {
    if (!ENTRY_CONFIDENCES.includes(r["confidence"] as EntryConfidence)) {
      throw new Error(
        `recall: confidence must be one of ${ENTRY_CONFIDENCES.join(", ")}`,
      );
    }
    out.confidence = r["confidence"] as EntryConfidence;
  }
  for (const f of ["as_of_after", "as_of_before"] as const) {
    if (r[f] !== undefined) {
      if (typeof r[f] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r[f] as string)) {
        throw new Error(`recall: ${f} must be YYYY-MM-DD`);
      }
      out[f] = r[f] as string;
    }
  }
  if (r["relation"] !== undefined) {
    out.relation = parseRelationFilter(r["relation"]);
  }
  if (r["limit"] !== undefined) {
    const n = r["limit"];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 100) {
      throw new Error("recall: limit must be an integer 1..100");
    }
    out.limit = n;
  }
  return out;
}

function parseRelationFilter(raw: unknown): RecallRelationFilter {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("recall.relation must be an object");
  }
  const r = raw as Record<string, unknown>;
  const allowed = ["kind", "direction", "target"];
  for (const k of Object.keys(r)) {
    if (!allowed.includes(k)) {
      throw new Error(`recall.relation: unknown field ${k}`);
    }
  }
  const kind = r["kind"];
  if (
    typeof kind !== "string" ||
    !["supersedes", "contradicts", "reinforces", "derived_from"].includes(kind)
  ) {
    throw new Error(
      "recall.relation.kind must be one of supersedes, contradicts, reinforces, derived_from",
    );
  }
  const direction = r["direction"];
  if (typeof direction !== "string" || !["from", "to"].includes(direction)) {
    throw new Error("recall.relation.direction must be 'from' or 'to'");
  }
  const target = r["target"];
  if (typeof target !== "string" || target.length === 0) {
    throw new Error("recall.relation.target must be a non-empty string");
  }
  return {
    kind: kind as RecallRelationFilter["kind"],
    direction: direction as RecallRelationFilter["direction"],
    target,
  };
}

export async function recall(
  projectRoot: string,
  rawInput: unknown,
): Promise<RecallResult> {
  const input = validateRecallInput(rawInput);
  const entries = await listEntries(projectRoot);

  // For direction:"to", precompute the set of ids that target points TO via the
  // requested relation. The semantic: relation { kind, direction:"to", target }
  // finds the entries that `target.relations[kind]` lists.
  let toSet: Set<string> | null = null;
  if (input.relation && input.relation.direction === "to") {
    const { kind, target } = input.relation;
    const targetEntry = entries.find((e) => e.frontmatter.id === target);
    toSet = new Set(targetEntry ? targetEntry.frontmatter.relations[kind] : []);
  }

  const filtered = entries.filter((e) => matches(e, input, toSet));
  const scored = filtered
    .map((e) => ({ entry: e, score: scoreEntry(e, input) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.entry.frontmatter.updated_at !== b.entry.frontmatter.updated_at) {
        return a.entry.frontmatter.updated_at < b.entry.frontmatter.updated_at
          ? 1
          : -1;
      }
      return a.entry.frontmatter.id < b.entry.frontmatter.id ? -1 : 1;
    });
  const limit = input.limit ?? 20;
  const hits = scored.slice(0, limit).map(({ entry, score }) => ({
    id: entry.frontmatter.id,
    kind: entry.frontmatter.kind,
    claim: entry.frontmatter.claim,
    status: entry.frontmatter.status,
    confidence: entry.frontmatter.confidence,
    as_of: entry.frontmatter.as_of,
    updated_at: entry.frontmatter.updated_at,
    score: round(score),
    path: entry.location.relativePath,
  }));
  return { total: scored.length, hits };
}

function matches(
  entry: LoadedEntry,
  input: RecallInput,
  toSet: Set<string> | null,
): boolean {
  const fm = entry.frontmatter;
  if (input.kind && fm.kind !== input.kind) return false;
  if (input.status && fm.status !== input.status) return false;
  if (input.confidence && fm.confidence !== input.confidence) return false;
  if (input.as_of_after && fm.as_of < input.as_of_after) return false;
  if (input.as_of_before && fm.as_of > input.as_of_before) return false;
  if (input.relation) {
    const { kind, direction, target } = input.relation;
    if (direction === "from") {
      // find entries whose relations[kind] includes target
      if (!fm.relations[kind].includes(target)) return false;
    } else {
      // direction === "to": find entries that target points TO via relation
      if (!toSet || !toSet.has(fm.id)) return false;
    }
  }
  return true;
}

function scoreEntry(entry: LoadedEntry, input: RecallInput): number {
  const q = input.query?.trim().toLowerCase();
  if (!q) return baseScore(entry);
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return baseScore(entry);
  const claim = entry.frontmatter.claim.toLowerCase();
  const body = entry.body.toLowerCase();
  const tags = entry.frontmatter.tags.join(" ").toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (claim.includes(t)) score += 3;
    if (tags.includes(t)) score += 2;
    if (body.includes(t)) score += 1;
  }
  return score + baseScore(entry) * 0.1;
}

function baseScore(entry: LoadedEntry): number {
  let s = 0;
  switch (entry.frontmatter.confidence) {
    case "high":
      s += 3;
      break;
    case "medium":
      s += 2;
      break;
    case "low":
      s += 1;
      break;
  }
  if (entry.frontmatter.status === "active") s += 1;
  return s;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
