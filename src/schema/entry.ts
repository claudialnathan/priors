import { isSafeId } from "../util/safe-path.ts";

export type EntryKind =
  | "decision"
  | "failure"
  | "constraint"
  | "pattern"
  | "question"
  | "hypothesis";

export type EntryStatus =
  | "active"
  | "stale"
  | "superseded"
  | "contested"
  | "action_pending";

export type EntryConfidence = "high" | "medium" | "low";

export const ENTRY_KINDS: readonly EntryKind[] = [
  "decision",
  "failure",
  "constraint",
  "pattern",
  "question",
  "hypothesis",
] as const;

export const ENTRY_STATUSES: readonly EntryStatus[] = [
  "active",
  "stale",
  "superseded",
  "contested",
  "action_pending",
] as const;

export const ENTRY_CONFIDENCES: readonly EntryConfidence[] = [
  "high",
  "medium",
  "low",
] as const;

export interface EntryRelations {
  supersedes: string[];
  contradicts: string[];
  reinforces: string[];
  derived_from: string[];
}

export interface EntryFrontmatter {
  id: string;
  kind: EntryKind;
  status: EntryStatus;
  confidence: EntryConfidence;
  as_of: string;
  created_at: string;
  updated_at: string;
  claim: string;
  relations: EntryRelations;
  tags: string[];
  source_ref?: string;
  stale_reason?: string;
}

export interface Entry {
  frontmatter: EntryFrontmatter;
  body: string;
}

export interface IndexRow {
  id: string;
  kind: EntryKind;
  claim: string;
  status: EntryStatus;
  confidence: EntryConfidence;
  as_of: string;
  updated_at: string;
  path: string;
}

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export const CLAIM_MAX = 280;

export interface ValidationOk<T> {
  ok: true;
  value: T;
}

export interface ValidationErr {
  ok: false;
  errors: string[];
}

export type Validation<T> = ValidationOk<T> | ValidationErr;

export function ok<T>(value: T): ValidationOk<T> {
  return { ok: true, value };
}

export function err(...messages: string[]): ValidationErr {
  return { ok: false, errors: messages };
}

export function validateEntryFrontmatter(
  raw: unknown,
): Validation<EntryFrontmatter> {
  const errors: string[] = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return err("frontmatter must be an object");
  }
  const r = raw as Record<string, unknown>;

  const id = r["id"];
  if (typeof id !== "string" || !isSafeId(id)) {
    errors.push(`id must match ^[a-z0-9][a-z0-9-]{0,127}$ (got ${typeof id === "string" ? id : typeof id})`);
  }

  const kind = r["kind"];
  if (typeof kind !== "string" || !ENTRY_KINDS.includes(kind as EntryKind)) {
    errors.push(`kind must be one of ${ENTRY_KINDS.join(", ")}`);
  }

  const status = r["status"];
  if (
    typeof status !== "string" ||
    !ENTRY_STATUSES.includes(status as EntryStatus)
  ) {
    errors.push(`status must be one of ${ENTRY_STATUSES.join(", ")}`);
  }

  const confidence = r["confidence"];
  if (
    typeof confidence !== "string" ||
    !ENTRY_CONFIDENCES.includes(confidence as EntryConfidence)
  ) {
    errors.push(`confidence must be one of ${ENTRY_CONFIDENCES.join(", ")}`);
  }

  const asOf = r["as_of"];
  if (typeof asOf !== "string" || !ISO_DATE_RE.test(asOf)) {
    errors.push("as_of must be an ISO date (YYYY-MM-DD)");
  }

  const createdAt = r["created_at"];
  if (typeof createdAt !== "string" || !ISO_DATETIME_RE.test(createdAt)) {
    errors.push("created_at must be an ISO 8601 datetime in UTC (Z)");
  }

  const updatedAt = r["updated_at"];
  if (typeof updatedAt !== "string" || !ISO_DATETIME_RE.test(updatedAt)) {
    errors.push("updated_at must be an ISO 8601 datetime in UTC (Z)");
  }

  const claim = r["claim"];
  if (typeof claim !== "string" || claim.trim().length === 0) {
    errors.push("claim must be a non-empty string");
  } else if (claim.length > CLAIM_MAX) {
    errors.push(`claim must be ≤ ${CLAIM_MAX} characters (got ${claim.length})`);
  }

  const relations = normalizeRelations(r["relations"]);
  if (!relations.ok) errors.push(...relations.errors);

  const tags = normalizeStringList(r["tags"], "tags");
  if (!tags.ok) errors.push(...tags.errors);

  const allowedKeys = new Set([
    "id",
    "kind",
    "status",
    "confidence",
    "as_of",
    "created_at",
    "updated_at",
    "claim",
    "relations",
    "tags",
    "source_ref",
    "stale_reason",
  ]);
  for (const key of Object.keys(r)) {
    if (!allowedKeys.has(key)) {
      errors.push(`unknown frontmatter key: ${key}`);
    }
  }

  if (errors.length > 0) return err(...errors);

  const fm: EntryFrontmatter = {
    id: id as string,
    kind: kind as EntryKind,
    status: status as EntryStatus,
    confidence: confidence as EntryConfidence,
    as_of: asOf as string,
    created_at: createdAt as string,
    updated_at: updatedAt as string,
    claim: claim as string,
    relations: relations.ok ? relations.value : emptyRelations(),
    tags: tags.ok ? tags.value : [],
  };
  if (typeof r["source_ref"] === "string") fm.source_ref = r["source_ref"];
  if (typeof r["stale_reason"] === "string") fm.stale_reason = r["stale_reason"];
  return ok(fm);
}

export function emptyRelations(): EntryRelations {
  return {
    supersedes: [],
    contradicts: [],
    reinforces: [],
    derived_from: [],
  };
}

function normalizeRelations(raw: unknown): Validation<EntryRelations> {
  if (raw === undefined || raw === null) return ok(emptyRelations());
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return err("relations must be an object");
  }
  const r = raw as Record<string, unknown>;
  const allowed = ["supersedes", "contradicts", "reinforces", "derived_from"];
  const errors: string[] = [];
  for (const key of Object.keys(r)) {
    if (!allowed.includes(key)) errors.push(`unknown relations key: ${key}`);
  }
  const out = emptyRelations();
  for (const key of allowed as (keyof EntryRelations)[]) {
    const v = r[key];
    if (v === undefined) continue;
    const list = normalizeStringList(v, `relations.${key}`);
    if (!list.ok) errors.push(...list.errors);
    else {
      for (const id of list.value) {
        if (!isSafeId(id)) errors.push(`relations.${key} contains invalid id: ${id}`);
      }
      out[key] = list.value;
    }
  }
  if (errors.length > 0) return err(...errors);
  return ok(out);
}

function normalizeStringList(
  raw: unknown,
  label: string,
): Validation<string[]> {
  if (raw === undefined || raw === null) return ok([]);
  if (!Array.isArray(raw)) return err(`${label} must be a list`);
  for (const item of raw) {
    if (typeof item !== "string") return err(`${label} must be a list of strings`);
  }
  return ok(raw as string[]);
}
