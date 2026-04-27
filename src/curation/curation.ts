import { isoDatetime, systemClock, type Clock } from "../util/clock.ts";
import { isSafeId } from "../util/safe-path.ts";
import { newUuid } from "../util/uuid.ts";
import {
  deleteStagedEntry,
  findEntryById,
  listEntries,
  readStagedEntry,
  writeEntry,
  writeStagedEntry,
  type LoadedEntry,
} from "../store/entries.ts";
import { regenerateIndex } from "../store/index.ts";
import { appendAudit } from "../store/audit.ts";
import { appendCurationEvent } from "../store/curation-log.ts";
import { CLAIM_MAX, ENTRY_CONFIDENCES, type EntryConfidence } from "../schema/entry.ts";

export type RelationKind =
  | "supersedes"
  | "contradiction_of"
  | "derived_from"
  | "reinforces"
  | "caused_by"
  | "blocks"
  | "depends_on"
  | "refutes";

export const RELATION_KINDS: readonly RelationKind[] = [
  "supersedes",
  "contradiction_of",
  "derived_from",
  "reinforces",
  "caused_by",
  "blocks",
  "depends_on",
  "refutes",
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
  /** Both ids if a contradiction_of link flipped statuses to contested. */
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
  if (input.relation === "contradiction_of") {
    if (source.frontmatter.status !== "contested") {
      source.frontmatter.status = "contested";
      source.frontmatter.updated_at = isoDatetime(clock.now());
    }
    if (
      !target.frontmatter.relations.contradiction_of.includes(input.source_id)
    ) {
      target.frontmatter.relations.contradiction_of = [
        ...target.frontmatter.relations.contradiction_of,
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

export interface DiscardStagedInput {
  staged_id: string;
  rationale?: string;
  source_model?: string;
  client_request_id?: string;
}

export function validateDiscardStagedInput(raw: unknown): DiscardStagedInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("discard_staged: input must be an object");
  }
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) {
    if (
      !["staged_id", "rationale", "source_model", "client_request_id"].includes(k)
    ) {
      throw new Error(`discard_staged: unknown field ${k}`);
    }
  }
  if (typeof r["staged_id"] !== "string" || !isSafeId(r["staged_id"])) {
    throw new Error("discard_staged: staged_id is required");
  }
  for (const optional of ["rationale", "source_model", "client_request_id"]) {
    if (r[optional] !== undefined && typeof r[optional] !== "string") {
      throw new Error(`discard_staged: ${optional} must be a string`);
    }
  }
  return {
    staged_id: r["staged_id"] as string,
    ...(r["rationale"] !== undefined ? { rationale: r["rationale"] as string } : {}),
    ...(r["source_model"] !== undefined
      ? { source_model: r["source_model"] as string }
      : {}),
    ...(r["client_request_id"] !== undefined
      ? { client_request_id: r["client_request_id"] as string }
      : {}),
  };
}

export async function discardStaged(
  projectRoot: string,
  rawInput: unknown,
  opts: { clock?: Clock } = {},
): Promise<{ id: string; deleted: boolean }> {
  const input = validateDiscardStagedInput(rawInput);
  const clock = opts.clock ?? systemClock;
  const ts = isoDatetime(clock.now());
  const staged = await readStagedEntry(projectRoot, input.staged_id);
  if (!staged) {
    throw new Error(`discard_staged: staged entry ${input.staged_id} not found`);
  }
  const originalPayload = {
    frontmatter: { ...staged.frontmatter },
    body: staged.body,
  };
  await deleteStagedEntry(projectRoot, input.staged_id);
  await regenerateIndex(projectRoot, { clock });
  await appendAudit(projectRoot, {
    action: "discard_staged",
    actor: "user",
    staged_id: input.staged_id,
    ts,
    ...(input.client_request_id
      ? { client_request_id: input.client_request_id }
      : {}),
    ...(input.rationale ? { reason: input.rationale } : {}),
  });
  await appendCurationEvent(projectRoot, {
    kind: "discard",
    ts,
    source_model: input.source_model ?? "unknown",
    source_ref: staged.frontmatter.source_ref ?? "",
    staged_id: input.staged_id,
    original_payload: originalPayload,
    ...(input.client_request_id
      ? { client_request_id: input.client_request_id }
      : {}),
    ...(input.rationale ? { rationale: input.rationale } : {}),
  });
  return { id: input.staged_id, deleted: true };
}

export interface EditStagedInput {
  staged_id: string;
  claim?: string;
  confidence?: EntryConfidence;
  tags?: string[];
  body?: string;
  rationale?: string;
  source_model?: string;
  client_request_id?: string;
}

export function validateEditStagedInput(raw: unknown): EditStagedInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("edit_staged: input must be an object");
  }
  const r = raw as Record<string, unknown>;
  const allowed = [
    "staged_id",
    "claim",
    "confidence",
    "tags",
    "body",
    "rationale",
    "source_model",
    "client_request_id",
  ];
  for (const k of Object.keys(r)) {
    if (!allowed.includes(k)) throw new Error(`edit_staged: unknown field ${k}`);
  }
  if (typeof r["staged_id"] !== "string" || !isSafeId(r["staged_id"])) {
    throw new Error("edit_staged: staged_id is required");
  }
  const out: EditStagedInput = { staged_id: r["staged_id"] as string };
  if (r["claim"] !== undefined) {
    if (
      typeof r["claim"] !== "string" ||
      r["claim"].trim().length === 0 ||
      r["claim"].length > CLAIM_MAX
    ) {
      throw new Error(`edit_staged: claim must be 1..${CLAIM_MAX} chars`);
    }
    out.claim = r["claim"];
  }
  if (r["confidence"] !== undefined) {
    if (
      typeof r["confidence"] !== "string" ||
      !ENTRY_CONFIDENCES.includes(r["confidence"] as EntryConfidence)
    ) {
      throw new Error(
        `edit_staged: confidence must be one of ${ENTRY_CONFIDENCES.join(", ")}`,
      );
    }
    out.confidence = r["confidence"] as EntryConfidence;
  }
  if (r["tags"] !== undefined) {
    if (
      !Array.isArray(r["tags"]) ||
      !r["tags"].every((t) => typeof t === "string")
    ) {
      throw new Error("edit_staged: tags must be a list of strings");
    }
    out.tags = r["tags"] as string[];
  }
  if (r["body"] !== undefined) {
    if (typeof r["body"] !== "string") {
      throw new Error("edit_staged: body must be a string");
    }
    out.body = r["body"];
  }
  if (r["rationale"] !== undefined) {
    if (typeof r["rationale"] !== "string") {
      throw new Error("edit_staged: rationale must be a string");
    }
    out.rationale = r["rationale"];
  }
  if (r["source_model"] !== undefined) {
    if (typeof r["source_model"] !== "string") {
      throw new Error("edit_staged: source_model must be a string");
    }
    out.source_model = r["source_model"];
  }
  if (r["client_request_id"] !== undefined) {
    if (typeof r["client_request_id"] !== "string") {
      throw new Error("edit_staged: client_request_id must be a string");
    }
    out.client_request_id = r["client_request_id"];
  }
  if (
    out.claim === undefined &&
    out.confidence === undefined &&
    out.tags === undefined &&
    out.body === undefined
  ) {
    throw new Error(
      "edit_staged: at least one of claim, confidence, tags, body must be supplied",
    );
  }
  return out;
}

export async function editStaged(
  projectRoot: string,
  rawInput: unknown,
  opts: { clock?: Clock } = {},
): Promise<{ id: string; edited: boolean }> {
  const input = validateEditStagedInput(rawInput);
  const clock = opts.clock ?? systemClock;
  const ts = isoDatetime(clock.now());
  const staged = await readStagedEntry(projectRoot, input.staged_id);
  if (!staged) {
    throw new Error(`edit_staged: staged entry ${input.staged_id} not found`);
  }
  const originalPayload = {
    frontmatter: { ...staged.frontmatter },
    body: staged.body,
  };
  if (input.claim !== undefined) staged.frontmatter.claim = input.claim;
  if (input.confidence !== undefined) staged.frontmatter.confidence = input.confidence;
  if (input.tags !== undefined) staged.frontmatter.tags = input.tags;
  if (input.body !== undefined) staged.body = input.body;
  staged.frontmatter.updated_at = ts;
  await writeStagedEntry(projectRoot, staged);
  await regenerateIndex(projectRoot, { clock });
  const editedPayload = {
    frontmatter: { ...staged.frontmatter },
    body: staged.body,
  };
  await appendAudit(projectRoot, {
    action: "edit_staged",
    actor: "user",
    staged_id: input.staged_id,
    ts,
    ...(input.client_request_id
      ? { client_request_id: input.client_request_id }
      : {}),
    ...(input.rationale ? { reason: input.rationale } : {}),
  });
  await appendCurationEvent(projectRoot, {
    kind: "edit",
    ts,
    source_model: input.source_model ?? "unknown",
    source_ref: staged.frontmatter.source_ref ?? "",
    staged_id: input.staged_id,
    original_payload: originalPayload,
    edited_payload: editedPayload,
    ...(input.client_request_id
      ? { client_request_id: input.client_request_id }
      : {}),
    ...(input.rationale ? { rationale: input.rationale } : {}),
  });
  return { id: input.staged_id, edited: true };
}

export interface ProposeEdgeInput {
  source_id: string;
  relation: RelationKind;
  target_id: string;
  proposal_id?: string;
  source_model?: string;
  source_ref?: string;
  rationale?: string;
  client_request_id?: string;
}

function validateEdgeProposalCommon(
  raw: unknown,
  toolName: string,
): {
  r: Record<string, unknown>;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${toolName}: input must be an object`);
  }
  return { r: raw as Record<string, unknown> };
}

export function validateProposeEdgeInput(raw: unknown): ProposeEdgeInput {
  const { r } = validateEdgeProposalCommon(raw, "propose_edge");
  const allowed = [
    "source_id",
    "relation",
    "target_id",
    "proposal_id",
    "source_model",
    "source_ref",
    "rationale",
    "client_request_id",
  ];
  for (const k of Object.keys(r)) {
    if (!allowed.includes(k)) throw new Error(`propose_edge: unknown field ${k}`);
  }
  if (typeof r["source_id"] !== "string" || !isSafeId(r["source_id"])) {
    throw new Error("propose_edge: source_id is required");
  }
  if (typeof r["target_id"] !== "string" || !isSafeId(r["target_id"])) {
    throw new Error("propose_edge: target_id is required");
  }
  if (
    typeof r["relation"] !== "string" ||
    !RELATION_KINDS.includes(r["relation"] as RelationKind)
  ) {
    throw new Error(
      `propose_edge: relation must be one of ${RELATION_KINDS.join(", ")}`,
    );
  }
  for (const optional of [
    "proposal_id",
    "source_model",
    "source_ref",
    "rationale",
    "client_request_id",
  ]) {
    if (r[optional] !== undefined && typeof r[optional] !== "string") {
      throw new Error(`propose_edge: ${optional} must be a string`);
    }
  }
  return {
    source_id: r["source_id"] as string,
    target_id: r["target_id"] as string,
    relation: r["relation"] as RelationKind,
    ...(r["proposal_id"] !== undefined
      ? { proposal_id: r["proposal_id"] as string }
      : {}),
    ...(r["source_model"] !== undefined
      ? { source_model: r["source_model"] as string }
      : {}),
    ...(r["source_ref"] !== undefined
      ? { source_ref: r["source_ref"] as string }
      : {}),
    ...(r["rationale"] !== undefined
      ? { rationale: r["rationale"] as string }
      : {}),
    ...(r["client_request_id"] !== undefined
      ? { client_request_id: r["client_request_id"] as string }
      : {}),
  };
}

export async function proposeEdge(
  projectRoot: string,
  rawInput: unknown,
  opts: { clock?: Clock } = {},
): Promise<{ proposal_id: string }> {
  const input = validateProposeEdgeInput(rawInput);
  const clock = opts.clock ?? systemClock;
  if (input.source_id === input.target_id) {
    throw new Error("propose_edge: self-links are not allowed");
  }
  const proposal_id = input.proposal_id ?? newUuid();
  const ts = isoDatetime(clock.now());
  await appendCurationEvent(projectRoot, {
    kind: "propose_edge",
    ts,
    source_model: input.source_model ?? "unknown",
    source_ref: input.source_ref ?? "",
    proposal_id,
    edge_source_id: input.source_id,
    edge_relation: input.relation,
    edge_target_id: input.target_id,
    ...(input.rationale ? { rationale: input.rationale } : {}),
    ...(input.client_request_id
      ? { client_request_id: input.client_request_id }
      : {}),
  });
  return { proposal_id };
}

export interface CommitEdgeInput {
  proposal_id: string;
  source_id: string;
  relation: RelationKind;
  target_id: string;
  source_model?: string;
  source_ref?: string;
  rationale?: string;
  client_request_id?: string;
}

export function validateCommitEdgeInput(raw: unknown): CommitEdgeInput {
  const { r } = validateEdgeProposalCommon(raw, "commit_edge");
  const allowed = [
    "proposal_id",
    "source_id",
    "relation",
    "target_id",
    "source_model",
    "source_ref",
    "rationale",
    "client_request_id",
  ];
  for (const k of Object.keys(r)) {
    if (!allowed.includes(k)) throw new Error(`commit_edge: unknown field ${k}`);
  }
  if (typeof r["proposal_id"] !== "string" || r["proposal_id"].length === 0) {
    throw new Error("commit_edge: proposal_id is required");
  }
  if (typeof r["source_id"] !== "string" || !isSafeId(r["source_id"])) {
    throw new Error("commit_edge: source_id is required");
  }
  if (typeof r["target_id"] !== "string" || !isSafeId(r["target_id"])) {
    throw new Error("commit_edge: target_id is required");
  }
  if (
    typeof r["relation"] !== "string" ||
    !RELATION_KINDS.includes(r["relation"] as RelationKind)
  ) {
    throw new Error(
      `commit_edge: relation must be one of ${RELATION_KINDS.join(", ")}`,
    );
  }
  for (const optional of [
    "source_model",
    "source_ref",
    "rationale",
    "client_request_id",
  ]) {
    if (r[optional] !== undefined && typeof r[optional] !== "string") {
      throw new Error(`commit_edge: ${optional} must be a string`);
    }
  }
  return {
    proposal_id: r["proposal_id"] as string,
    source_id: r["source_id"] as string,
    target_id: r["target_id"] as string,
    relation: r["relation"] as RelationKind,
    ...(r["source_model"] !== undefined
      ? { source_model: r["source_model"] as string }
      : {}),
    ...(r["source_ref"] !== undefined
      ? { source_ref: r["source_ref"] as string }
      : {}),
    ...(r["rationale"] !== undefined
      ? { rationale: r["rationale"] as string }
      : {}),
    ...(r["client_request_id"] !== undefined
      ? { client_request_id: r["client_request_id"] as string }
      : {}),
  };
}

export async function commitEdge(
  projectRoot: string,
  rawInput: unknown,
  opts: { clock?: Clock } = {},
): Promise<LinkResult & { proposal_id: string }> {
  const input = validateCommitEdgeInput(rawInput);
  const clock = opts.clock ?? systemClock;
  const link = await linkEntries(
    projectRoot,
    {
      source_id: input.source_id,
      relation: input.relation,
      target_id: input.target_id,
      ...(input.client_request_id
        ? { client_request_id: input.client_request_id }
        : {}),
    },
    { clock },
  );
  await appendCurationEvent(projectRoot, {
    kind: "accept_edge",
    ts: isoDatetime(clock.now()),
    source_model: input.source_model ?? "unknown",
    source_ref: input.source_ref ?? "",
    proposal_id: input.proposal_id,
    edge_source_id: input.source_id,
    edge_relation: input.relation,
    edge_target_id: input.target_id,
    ...(input.rationale ? { rationale: input.rationale } : {}),
    ...(input.client_request_id
      ? { client_request_id: input.client_request_id }
      : {}),
  });
  return { ...link, proposal_id: input.proposal_id };
}

export interface DiscardEdgeInput {
  proposal_id: string;
  source_id: string;
  relation: RelationKind;
  target_id: string;
  rationale?: string;
  source_model?: string;
  client_request_id?: string;
}

export function validateDiscardEdgeInput(raw: unknown): DiscardEdgeInput {
  const { r } = validateEdgeProposalCommon(raw, "discard_edge");
  const allowed = [
    "proposal_id",
    "source_id",
    "relation",
    "target_id",
    "rationale",
    "source_model",
    "client_request_id",
  ];
  for (const k of Object.keys(r)) {
    if (!allowed.includes(k)) throw new Error(`discard_edge: unknown field ${k}`);
  }
  if (typeof r["proposal_id"] !== "string" || r["proposal_id"].length === 0) {
    throw new Error("discard_edge: proposal_id is required");
  }
  if (typeof r["source_id"] !== "string" || !isSafeId(r["source_id"])) {
    throw new Error("discard_edge: source_id is required");
  }
  if (typeof r["target_id"] !== "string" || !isSafeId(r["target_id"])) {
    throw new Error("discard_edge: target_id is required");
  }
  if (
    typeof r["relation"] !== "string" ||
    !RELATION_KINDS.includes(r["relation"] as RelationKind)
  ) {
    throw new Error(
      `discard_edge: relation must be one of ${RELATION_KINDS.join(", ")}`,
    );
  }
  for (const optional of [
    "rationale",
    "source_model",
    "client_request_id",
  ]) {
    if (r[optional] !== undefined && typeof r[optional] !== "string") {
      throw new Error(`discard_edge: ${optional} must be a string`);
    }
  }
  return {
    proposal_id: r["proposal_id"] as string,
    source_id: r["source_id"] as string,
    target_id: r["target_id"] as string,
    relation: r["relation"] as RelationKind,
    ...(r["rationale"] !== undefined
      ? { rationale: r["rationale"] as string }
      : {}),
    ...(r["source_model"] !== undefined
      ? { source_model: r["source_model"] as string }
      : {}),
    ...(r["client_request_id"] !== undefined
      ? { client_request_id: r["client_request_id"] as string }
      : {}),
  };
}

export async function discardEdge(
  projectRoot: string,
  rawInput: unknown,
  opts: { clock?: Clock } = {},
): Promise<{ proposal_id: string; discarded: true }> {
  const input = validateDiscardEdgeInput(rawInput);
  const clock = opts.clock ?? systemClock;
  await appendCurationEvent(projectRoot, {
    kind: "discard_edge",
    ts: isoDatetime(clock.now()),
    source_model: input.source_model ?? "unknown",
    source_ref: "",
    proposal_id: input.proposal_id,
    edge_source_id: input.source_id,
    edge_relation: input.relation,
    edge_target_id: input.target_id,
    ...(input.rationale ? { rationale: input.rationale } : {}),
    ...(input.client_request_id
      ? { client_request_id: input.client_request_id }
      : {}),
  });
  return { proposal_id: input.proposal_id, discarded: true };
}
