import { isoDate, isoDatetime, systemClock, type Clock } from "../util/clock.ts";
import { isSafeId } from "../util/safe-path.ts";
import {
  CLAIM_MAX,
  ENTRY_KINDS,
  emptyRelations,
  type EntryConfidence,
  type EntryKind,
} from "../schema/entry.ts";
import {
  findEntryById,
  listEntries,
  makeFrontmatter,
  readStagedEntry,
  writeStagedEntry,
  deleteStagedEntry,
  writeEntry,
  type LoadedEntry,
} from "../store/entries.ts";
import { regenerateIndex } from "../store/index.ts";
import { appendAudit, appendRejection, type DistillationReject } from "../store/audit.ts";
import { renderSystemAndUser, type PromptInputs } from "./prompt.ts";

const MAX_CANDIDATES = 5;
const REASONING_MAX = 600;
const EVIDENCE_MIN = 1;
const EVIDENCE_MAX = 5;

export type SourceKind =
  | "transcript"
  | "tool_trace"
  | "session_log"
  | "manual_text";

export interface CandidateEvidence {
  quote: string;
  source_ref: string;
  location: string;
}

export interface CandidateInput {
  kind: EntryKind;
  claim: string;
  evidence: CandidateEvidence[];
  reasoning: string;
  confidence: EntryConfidence;
  relations?: {
    supersedes?: string[];
    contradicts?: string[];
    reinforces?: string[];
    derived_from?: string[];
  };
  flags?: string[];
  /** Optional explicit id; otherwise we generate one. */
  id?: string;
}

export interface StageInput {
  source_kind: SourceKind;
  source_ref: string;
  source_content: string;
  project_id: string;
  candidates?: CandidateInput[];
  existing_entries?: Array<{ id: string; claim: string }>;
  prompt_context?: string;
  client_request_id?: string;
}

export interface StagedRecord {
  id: string;
  kind: EntryKind;
  claim: string;
  confidence: EntryConfidence;
  flags: string[];
  evidence: CandidateEvidence[];
  reasoning: string;
  /** Path under .priors/ */
  path: string;
}

export interface StageRejected {
  reason_code: DistillationReject["reason_code"];
  message: string;
  candidate: CandidateInput;
}

export interface StageResult {
  /** When candidates is omitted, we return the prompt for the caller to use. */
  mode: "prompt" | "verify";
  prompt?: { system: string; user: string };
  staged: StagedRecord[];
  rejected: StageRejected[];
  no_candidates_reason?: string;
}

const FORBIDDEN_PATTERNS: RegExp[] = [
  /\buser\s+(prefer|preferred|prefers|likes|wants|wanted|enjoys|hates|dislikes)\b/i,
  /\buser\s+(is|was|seems|feels|felt|believes|thinks)\b/i,
  /\b(user|the\s+user)['’]s\s+(personality|psychology|emotion|mood|background|identity)\b/i,
  /\babout\s+the\s+user\b/i,
];

export function validateStageInput(raw: unknown): StageInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("stage_learning: input must be an object");
  }
  const r = raw as Record<string, unknown>;
  const allowed = [
    "source_kind",
    "source_ref",
    "source_content",
    "project_id",
    "candidates",
    "existing_entries",
    "prompt_context",
    "client_request_id",
    "no_candidates_reason",
  ];
  for (const k of Object.keys(r)) {
    if (!allowed.includes(k)) throw new Error(`stage_learning: unknown field ${k}`);
  }
  const sk = r["source_kind"];
  if (
    typeof sk !== "string" ||
    !["transcript", "tool_trace", "session_log", "manual_text"].includes(sk)
  ) {
    throw new Error(
      "stage_learning: source_kind is required (transcript|tool_trace|session_log|manual_text)",
    );
  }
  if (typeof r["source_ref"] !== "string" || r["source_ref"].length === 0) {
    throw new Error("stage_learning: source_ref is required");
  }
  if (
    typeof r["source_content"] !== "string" ||
    r["source_content"].length === 0
  ) {
    throw new Error("stage_learning: source_content is required");
  }
  if (typeof r["project_id"] !== "string" || r["project_id"].length === 0) {
    throw new Error("stage_learning: project_id is required");
  }
  const out: StageInput = {
    source_kind: sk as SourceKind,
    source_ref: r["source_ref"] as string,
    source_content: r["source_content"] as string,
    project_id: r["project_id"] as string,
  };
  if (r["candidates"] !== undefined) {
    if (!Array.isArray(r["candidates"])) {
      throw new Error("stage_learning: candidates must be an array");
    }
    out.candidates = (r["candidates"] as unknown[]).map(validateCandidate);
  }
  if (r["existing_entries"] !== undefined) {
    if (!Array.isArray(r["existing_entries"])) {
      throw new Error("stage_learning: existing_entries must be an array");
    }
    out.existing_entries = (r["existing_entries"] as unknown[]).map(
      (item, idx) => {
        if (
          !item ||
          typeof item !== "object" ||
          Array.isArray(item) ||
          typeof (item as Record<string, unknown>)["id"] !== "string" ||
          typeof (item as Record<string, unknown>)["claim"] !== "string"
        ) {
          throw new Error(
            `stage_learning: existing_entries[${idx}] must be {id, claim}`,
          );
        }
        return {
          id: (item as Record<string, unknown>)["id"] as string,
          claim: (item as Record<string, unknown>)["claim"] as string,
        };
      },
    );
  }
  if (r["prompt_context"] !== undefined) {
    if (typeof r["prompt_context"] !== "string") {
      throw new Error("stage_learning: prompt_context must be a string");
    }
    out.prompt_context = r["prompt_context"];
  }
  if (r["client_request_id"] !== undefined) {
    if (typeof r["client_request_id"] !== "string") {
      throw new Error("stage_learning: client_request_id must be a string");
    }
    out.client_request_id = r["client_request_id"];
  }
  return out;
}

function validateCandidate(raw: unknown, idx: number): CandidateInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`candidates[${idx}] must be an object`);
  }
  const r = raw as Record<string, unknown>;
  const allowed = [
    "kind",
    "claim",
    "evidence",
    "reasoning",
    "confidence",
    "relations",
    "flags",
    "id",
  ];
  for (const k of Object.keys(r)) {
    if (!allowed.includes(k)) {
      throw new Error(`candidates[${idx}] unknown field: ${k}`);
    }
  }
  const kind = r["kind"];
  if (typeof kind !== "string" || !ENTRY_KINDS.includes(kind as EntryKind)) {
    throw new Error(
      `candidates[${idx}].kind must be one of ${ENTRY_KINDS.join(", ")}`,
    );
  }
  const claim = r["claim"];
  if (typeof claim !== "string" || claim.length === 0) {
    throw new Error(`candidates[${idx}].claim is required`);
  }
  const evidence = r["evidence"];
  if (!Array.isArray(evidence)) {
    throw new Error(`candidates[${idx}].evidence must be a list`);
  }
  const ev: CandidateEvidence[] = evidence.map((q, j) => {
    if (!q || typeof q !== "object" || Array.isArray(q)) {
      throw new Error(`candidates[${idx}].evidence[${j}] must be an object`);
    }
    const qr = q as Record<string, unknown>;
    if (typeof qr["quote"] !== "string" || qr["quote"].length === 0) {
      throw new Error(`candidates[${idx}].evidence[${j}].quote is required`);
    }
    if (typeof qr["source_ref"] !== "string") {
      throw new Error(`candidates[${idx}].evidence[${j}].source_ref is required`);
    }
    if (typeof qr["location"] !== "string") {
      throw new Error(`candidates[${idx}].evidence[${j}].location is required`);
    }
    return {
      quote: qr["quote"] as string,
      source_ref: qr["source_ref"] as string,
      location: qr["location"] as string,
    };
  });
  const reasoning = r["reasoning"];
  if (typeof reasoning !== "string") {
    throw new Error(`candidates[${idx}].reasoning is required`);
  }
  const confidence = r["confidence"];
  if (
    typeof confidence !== "string" ||
    !["high", "medium", "low"].includes(confidence)
  ) {
    throw new Error(
      `candidates[${idx}].confidence must be one of high|medium|low`,
    );
  }
  const out: CandidateInput = {
    kind: kind as EntryKind,
    claim: claim as string,
    evidence: ev,
    reasoning: reasoning as string,
    confidence: confidence as EntryConfidence,
  };
  if (r["relations"] !== undefined) {
    out.relations = validateRelations(r["relations"], idx);
  }
  if (r["flags"] !== undefined) {
    if (
      !Array.isArray(r["flags"]) ||
      !r["flags"].every((x) => typeof x === "string")
    ) {
      throw new Error(`candidates[${idx}].flags must be a list of strings`);
    }
    out.flags = r["flags"] as string[];
  }
  if (r["id"] !== undefined) {
    if (typeof r["id"] !== "string" || !isSafeId(r["id"])) {
      throw new Error(`candidates[${idx}].id must be a safe id`);
    }
    out.id = r["id"];
  }
  return out;
}

function validateRelations(
  raw: unknown,
  idx: number,
): CandidateInput["relations"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`candidates[${idx}].relations must be an object`);
  }
  const r = raw as Record<string, unknown>;
  const out: NonNullable<CandidateInput["relations"]> = {};
  for (const [k, v] of Object.entries(r)) {
    if (!["supersedes", "contradicts", "reinforces", "derived_from"].includes(k)) {
      throw new Error(`candidates[${idx}].relations: unknown key ${k}`);
    }
    if (
      !Array.isArray(v) ||
      !v.every((x) => typeof x === "string" && isSafeId(x))
    ) {
      throw new Error(
        `candidates[${idx}].relations.${k} must be a list of safe ids`,
      );
    }
    out[k as keyof typeof out] = v as string[];
  }
  return out;
}

export async function stageLearning(
  projectRoot: string,
  rawInput: unknown,
  opts: { clock?: Clock } = {},
): Promise<StageResult> {
  const input = validateStageInput(rawInput);
  const clock = opts.clock ?? systemClock;

  if (!input.candidates) {
    const promptInputs: PromptInputs = {
      source_kind: input.source_kind,
      source_ref: input.source_ref,
      source_content: input.source_content,
      ...(input.project_id ? { project_id: input.project_id } : {}),
      ...(input.existing_entries
        ? { existing_entries: input.existing_entries }
        : {}),
      ...(input.prompt_context ? { prompt_context: input.prompt_context } : {}),
    };
    return {
      mode: "prompt",
      prompt: renderSystemAndUser(promptInputs),
      staged: [],
      rejected: [],
    };
  }

  if (input.candidates.length > MAX_CANDIDATES) {
    throw new Error(
      `stage_learning: too many candidates (max ${MAX_CANDIDATES}, got ${input.candidates.length})`,
    );
  }

  const activeEntries = await listEntries(projectRoot);
  const staged: StagedRecord[] = [];
  const rejected: StageRejected[] = [];
  const ts = isoDatetime(clock.now());
  const today = isoDate(clock.now());

  for (let i = 0; i < input.candidates.length; i++) {
    const candidate = input.candidates[i]!;
    const v = verifyCandidate(candidate, input.source_content, activeEntries);
    if (!v.ok) {
      rejected.push({ ...v, candidate });
      await appendRejection(projectRoot, {
        ts,
        source_ref: input.source_ref,
        reason_code: v.reason_code,
        message: v.message,
        candidate,
        ...(input.client_request_id
          ? { client_request_id: input.client_request_id }
          : {}),
      });
      continue;
    }
    if (v.dedup_into) {
      rejected.push({
        reason_code: "duplicate_of_active",
        message: `claim deduplicates into existing entry ${v.dedup_into}`,
        candidate,
      });
      await appendRejection(projectRoot, {
        ts,
        source_ref: input.source_ref,
        reason_code: "duplicate_of_active",
        message: `claim deduplicates into existing entry ${v.dedup_into}`,
        candidate,
        ...(input.client_request_id
          ? { client_request_id: input.client_request_id }
          : {}),
      });
      continue;
    }
    const id = candidate.id ?? generateStagedId(today, candidate, i);
    const existing = await readStagedEntry(projectRoot, id);
    if (existing) {
      // Idempotent: skip but still report as already staged.
      staged.push({
        id,
        kind: candidate.kind,
        claim: candidate.claim,
        confidence: candidate.confidence,
        flags: candidate.flags ?? [],
        evidence: candidate.evidence,
        reasoning: candidate.reasoning,
        path: existing.location.relativePath,
      });
      continue;
    }
    const fm = makeFrontmatter(
      id,
      candidate.kind,
      candidate.claim,
      today,
      ts,
      ts,
      {
        status: "active",
        confidence: candidate.confidence,
        relations: {
          supersedes: candidate.relations?.supersedes ?? [],
          contradicts: candidate.relations?.contradicts ?? [],
          reinforces: candidate.relations?.reinforces ?? [],
          derived_from: candidate.relations?.derived_from ?? [],
        },
        tags: candidate.flags ?? [],
        source_ref: input.source_ref,
      },
    );
    const body = buildEntryBody(candidate, input.source_ref);
    const location = await writeStagedEntry(projectRoot, {
      frontmatter: fm,
      body,
    });
    staged.push({
      id,
      kind: candidate.kind,
      claim: candidate.claim,
      confidence: candidate.confidence,
      flags: candidate.flags ?? [],
      evidence: candidate.evidence,
      reasoning: candidate.reasoning,
      path: location.relativePath,
    });
    await appendAudit(projectRoot, {
      action: "stage_learning",
      actor: "tool",
      staged_id: id,
      kind: candidate.kind,
      ts,
      ...(input.client_request_id
        ? { client_request_id: input.client_request_id }
        : {}),
    });
  }

  await regenerateIndex(projectRoot, { clock });

  return {
    mode: "verify",
    staged,
    rejected,
    ...(staged.length === 0 && rejected.length === 0
      ? { no_candidates_reason: "no candidates were submitted" }
      : {}),
  };
}

interface VerifyOk {
  ok: true;
  dedup_into?: string;
}
interface VerifyFail {
  ok: false;
  reason_code: DistillationReject["reason_code"];
  message: string;
}

function verifyCandidate(
  candidate: CandidateInput,
  sourceContent: string,
  activeEntries: LoadedEntry[],
): VerifyOk | VerifyFail {
  if (candidate.claim.length > CLAIM_MAX) {
    return {
      ok: false,
      reason_code: "claim_too_long",
      message: `claim exceeds ${CLAIM_MAX} chars (${candidate.claim.length})`,
    };
  }
  if (candidate.reasoning.length > REASONING_MAX) {
    return {
      ok: false,
      reason_code: "reasoning_too_long",
      message: `reasoning exceeds ${REASONING_MAX} chars (${candidate.reasoning.length})`,
    };
  }
  if (
    candidate.evidence.length < EVIDENCE_MIN ||
    candidate.evidence.length > EVIDENCE_MAX
  ) {
    return {
      ok: false,
      reason_code: "evidence_count_invalid",
      message: `evidence count must be between ${EVIDENCE_MIN} and ${EVIDENCE_MAX} (got ${candidate.evidence.length})`,
    };
  }
  for (const f of FORBIDDEN_PATTERNS) {
    if (f.test(candidate.claim) || f.test(candidate.reasoning)) {
      return {
        ok: false,
        reason_code: "forbidden_kind",
        message: "candidate appears to make a claim about the user; forbidden in v1",
      };
    }
  }
  const normalisedSource = normaliseQuote(sourceContent);
  for (const e of candidate.evidence) {
    const q = normaliseQuote(e.quote);
    if (q.length === 0) {
      return {
        ok: false,
        reason_code: "quote_not_in_source",
        message: "evidence quote is empty after normalisation",
      };
    }
    if (!normalisedSource.includes(q)) {
      return {
        ok: false,
        reason_code: "quote_not_in_source",
        message: `evidence quote not found verbatim in source: "${truncate(e.quote, 80)}"`,
      };
    }
  }

  const dedup = findDedupTarget(candidate, activeEntries);
  if (dedup) return { ok: true, dedup_into: dedup };
  return { ok: true };
}

function findDedupTarget(
  candidate: CandidateInput,
  activeEntries: LoadedEntry[],
): string | undefined {
  const claim = candidate.claim.trim().toLowerCase();
  for (const e of activeEntries) {
    if (e.frontmatter.kind !== candidate.kind) continue;
    if (e.frontmatter.status !== "active") continue;
    const existing = e.frontmatter.claim.trim().toLowerCase();
    if (similarity(claim, existing) > 0.8) return e.frontmatter.id;
  }
  return undefined;
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const aTokens = new Set(a.split(/\s+/).filter((x) => x.length > 2));
  const bTokens = new Set(b.split(/\s+/).filter((x) => x.length > 2));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let inter = 0;
  for (const t of aTokens) if (bTokens.has(t)) inter++;
  return (2 * inter) / (aTokens.size + bTokens.size);
}

function normaliseQuote(s: string): string {
  return s.replaceAll(/\s+/g, " ").trim().toLowerCase();
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function buildEntryBody(candidate: CandidateInput, sourceRef: string): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("## Reasoning");
  lines.push(candidate.reasoning);
  lines.push("");
  lines.push("## Evidence");
  for (const e of candidate.evidence) {
    lines.push(`- ${e.source_ref} (${e.location}): "${e.quote}"`);
  }
  if (candidate.flags && candidate.flags.length > 0) {
    lines.push("");
    lines.push("## Flags");
    for (const f of candidate.flags) lines.push(`- ${f}`);
  }
  lines.push("");
  lines.push(`Source: ${sourceRef}`);
  return lines.join("\n") + "\n";
}

function generateStagedId(
  today: string,
  candidate: CandidateInput,
  index: number,
): string {
  const slug = slugify(candidate.claim);
  const base = `pri-${today.replaceAll("-", "")}-${slug || "candidate"}`;
  return index === 0 ? base : `${base}-${index + 1}`;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "candidate";
}

export interface CommitInput {
  staged_id: string;
  client_request_id?: string;
}

export function validateCommitInput(raw: unknown): CommitInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("commit_learning: input must be an object");
  }
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) {
    if (!["staged_id", "client_request_id"].includes(k)) {
      throw new Error(`commit_learning: unknown field ${k}`);
    }
  }
  if (typeof r["staged_id"] !== "string" || !isSafeId(r["staged_id"])) {
    throw new Error("commit_learning: staged_id is required");
  }
  if (
    r["client_request_id"] !== undefined &&
    typeof r["client_request_id"] !== "string"
  ) {
    throw new Error("commit_learning: client_request_id must be a string");
  }
  return {
    staged_id: r["staged_id"] as string,
    ...(r["client_request_id"] !== undefined
      ? { client_request_id: r["client_request_id"] as string }
      : {}),
  };
}

export async function commitLearning(
  projectRoot: string,
  rawInput: unknown,
  opts: { clock?: Clock } = {},
): Promise<{ id: string; kind: EntryKind; path: string; noop: boolean }> {
  const input = validateCommitInput(rawInput);
  const clock = opts.clock ?? systemClock;
  const ts = isoDatetime(clock.now());

  const existingActive = await findEntryById(projectRoot, input.staged_id);
  if (existingActive) {
    return {
      id: input.staged_id,
      kind: existingActive.frontmatter.kind,
      path: existingActive.location.relativePath,
      noop: true,
    };
  }

  const staged = await readStagedEntry(projectRoot, input.staged_id);
  if (!staged) {
    throw new Error(`commit_learning: staged entry ${input.staged_id} not found`);
  }

  staged.frontmatter.updated_at = ts;
  staged.frontmatter.status = "active";
  const location = await writeEntry(projectRoot, staged);
  await deleteStagedEntry(projectRoot, input.staged_id);
  await regenerateIndex(projectRoot, { clock });

  await appendAudit(projectRoot, {
    action: "commit_learning",
    actor: "user",
    entry_id: input.staged_id,
    kind: staged.frontmatter.kind,
    ts,
    ...(input.client_request_id
      ? { client_request_id: input.client_request_id }
      : {}),
  });

  return {
    id: input.staged_id,
    kind: staged.frontmatter.kind,
    path: location.relativePath,
    noop: false,
  };
}

export { emptyRelations };
