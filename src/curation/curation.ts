import { isoDatetime, systemClock, type Clock } from "../util/clock.ts";
import { isSafeId } from "../util/safe-path.ts";
import {
  findEntryById,
  listEntries,
  writeEntry,
  type LoadedEntry,
} from "../store/entries.ts";
import { regenerateIndex } from "../store/index.ts";
import { appendAudit } from "../store/audit.ts";

export type RelationKind =
  | "supersedes"
  | "contradicts"
  | "reinforces"
  | "derived_from";

export const RELATION_KINDS: readonly RelationKind[] = [
  "supersedes",
  "contradicts",
  "reinforces",
  "derived_from",
] as const;

export interface LinkInput {
  source_id: string;
  relation: RelationKind;
  target_id: string;
  client_request_id?: string;
}

export interface LinkResult {
  source_id: string;
  relation: RelationKind;
  target_id: string;
  /** Both ids if a contradicts link flipped statuses to contested. */
  contested_pair?: [string, string];
  /** True if the relation was already present (idempotent). */
  noop: boolean;
}

export function validateLinkInput(raw: unknown): LinkInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("link_entries: input must be an object");
  }
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) {
    if (!["source_id", "relation", "target_id", "client_request_id"].includes(k)) {
      throw new Error(`link_entries: unknown field ${k}`);
    }
  }
  if (typeof r["source_id"] !== "string" || !isSafeId(r["source_id"])) {
    throw new Error("link_entries: source_id is required and must be a safe id");
  }
  if (typeof r["target_id"] !== "string" || !isSafeId(r["target_id"])) {
    throw new Error("link_entries: target_id is required and must be a safe id");
  }
  if (
    typeof r["relation"] !== "string" ||
    !RELATION_KINDS.includes(r["relation"] as RelationKind)
  ) {
    throw new Error(
      `link_entries: relation must be one of ${RELATION_KINDS.join(", ")}`,
    );
  }
  if (
    r["client_request_id"] !== undefined &&
    typeof r["client_request_id"] !== "string"
  ) {
    throw new Error("link_entries: client_request_id must be a string");
  }
  return {
    source_id: r["source_id"],
    target_id: r["target_id"],
    relation: r["relation"] as RelationKind,
    ...(r["client_request_id"] !== undefined
      ? { client_request_id: r["client_request_id"] as string }
      : {}),
  };
}

export async function linkEntries(
  projectRoot: string,
  rawInput: unknown,
  opts: { clock?: Clock } = {},
): Promise<LinkResult> {
  const input = validateLinkInput(rawInput);
  if (input.source_id === input.target_id) {
    throw new Error("link_entries: self-links are not allowed");
  }
  const clock = opts.clock ?? systemClock;

  const source = await findEntryById(projectRoot, input.source_id);
  if (!source) throw new Error(`link_entries: source ${input.source_id} not found`);
  const target = await findEntryById(projectRoot, input.target_id);
  if (!target) throw new Error(`link_entries: target ${input.target_id} not found`);

  if (input.relation === "supersedes") {
    await assertNoSupersedesCycle(projectRoot, input.source_id, input.target_id);
  }

  const noop = source.frontmatter.relations[input.relation].includes(
    input.target_id,
  );
  if (!noop) {
    source.frontmatter.relations[input.relation] = [
      ...source.frontmatter.relations[input.relation],
      input.target_id,
    ];
    source.frontmatter.updated_at = isoDatetime(clock.now());
  }

  let contested: [string, string] | undefined;
  let targetMutated = false;
  if (input.relation === "contradicts") {
    if (source.frontmatter.status !== "contested") {
      source.frontmatter.status = "contested";
      source.frontmatter.updated_at = isoDatetime(clock.now());
    }
    if (!target.frontmatter.relations.contradicts.includes(input.source_id)) {
      target.frontmatter.relations.contradicts = [
        ...target.frontmatter.relations.contradicts,
        input.source_id,
      ];
      targetMutated = true;
    }
    if (target.frontmatter.status !== "contested") {
      target.frontmatter.status = "contested";
      targetMutated = true;
    }
    if (targetMutated) target.frontmatter.updated_at = isoDatetime(clock.now());
    contested = [input.source_id, input.target_id];
  } else if (input.relation === "supersedes" && !noop) {
    if (target.frontmatter.status !== "superseded") {
      target.frontmatter.status = "superseded";
      target.frontmatter.updated_at = isoDatetime(clock.now());
      targetMutated = true;
    }
  }

  if (!noop) await writeEntry(projectRoot, source);
  if (targetMutated) await writeEntry(projectRoot, target);
  await regenerateIndex(projectRoot, { clock });

  const audit = {
    action: "link_entries",
    actor: "tool",
    source_id: input.source_id,
    target_id: input.target_id,
    relation: input.relation,
    ts: isoDatetime(clock.now()),
    ...(input.client_request_id
      ? { client_request_id: input.client_request_id }
      : {}),
    ...(noop ? { note: "noop (relation already present)" } : {}),
  };
  await appendAudit(projectRoot, audit);

  return {
    source_id: input.source_id,
    target_id: input.target_id,
    relation: input.relation,
    noop,
    ...(contested ? { contested_pair: contested } : {}),
  };
}

async function assertNoSupersedesCycle(
  projectRoot: string,
  sourceId: string,
  targetId: string,
): Promise<void> {
  const all = await listEntries(projectRoot);
  const byId = new Map(all.map((e) => [e.frontmatter.id, e]));
  // Walk supersedes chain from target. If we ever reach sourceId, it's a cycle.
  const visited = new Set<string>();
  const stack: string[] = [targetId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const entry = byId.get(cur);
    if (!entry) continue;
    for (const next of entry.frontmatter.relations.supersedes) {
      if (next === sourceId) {
        throw new Error(
          `link_entries: refusing supersedes cycle ${sourceId} → ${targetId} → … → ${sourceId}`,
        );
      }
      stack.push(next);
    }
  }
}

export interface MarkStaleInput {
  id: string;
  reason: string;
  client_request_id?: string;
}

export function validateMarkStaleInput(raw: unknown): MarkStaleInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("mark_stale: input must be an object");
  }
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) {
    if (!["id", "reason", "client_request_id"].includes(k)) {
      throw new Error(`mark_stale: unknown field ${k}`);
    }
  }
  if (typeof r["id"] !== "string" || !isSafeId(r["id"])) {
    throw new Error("mark_stale: id is required");
  }
  if (
    typeof r["reason"] !== "string" ||
    r["reason"].trim().length === 0 ||
    r["reason"].length > 500
  ) {
    throw new Error("mark_stale: reason must be a non-empty string ≤500 chars");
  }
  if (
    r["client_request_id"] !== undefined &&
    typeof r["client_request_id"] !== "string"
  ) {
    throw new Error("mark_stale: client_request_id must be a string");
  }
  return {
    id: r["id"],
    reason: r["reason"],
    ...(r["client_request_id"] !== undefined
      ? { client_request_id: r["client_request_id"] as string }
      : {}),
  };
}

export async function markStale(
  projectRoot: string,
  rawInput: unknown,
  opts: { clock?: Clock } = {},
): Promise<{ id: string; status: "stale"; reason: string; noop: boolean }> {
  const input = validateMarkStaleInput(rawInput);
  const clock = opts.clock ?? systemClock;
  const entry: LoadedEntry | null = await findEntryById(projectRoot, input.id);
  if (!entry) throw new Error(`mark_stale: ${input.id} not found`);

  let noop = false;
  if (
    entry.frontmatter.status === "stale" &&
    entry.frontmatter.stale_reason === input.reason
  ) {
    noop = true;
  } else {
    entry.frontmatter.status = "stale";
    entry.frontmatter.stale_reason = input.reason;
    entry.frontmatter.updated_at = isoDatetime(clock.now());
    await writeEntry(projectRoot, entry);
    await regenerateIndex(projectRoot, { clock });
  }

  await appendAudit(projectRoot, {
    action: "mark_stale",
    actor: "tool",
    entry_id: input.id,
    reason: input.reason,
    ts: isoDatetime(clock.now()),
    ...(input.client_request_id
      ? { client_request_id: input.client_request_id }
      : {}),
    ...(noop ? { note: "noop (already stale with same reason)" } : {}),
  });

  return { id: input.id, status: "stale", reason: input.reason, noop };
}
