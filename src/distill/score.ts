/**
 * Composite quality score over the deterministic verifier checks.
 *
 * The point of this module is to make the binary verification gate
 * inspectable: every check still produces a boolean today, but it ALSO
 * produces a sub-score in [0, 1] that lands in the curation log alongside
 * the `propose` event. Operators tune `commitThreshold` in config to filter
 * borderline entries that pass hard checks but score low.
 *
 * No LLM is asked to rate quality. Every sub-score is computed from the
 * same inputs the existing checks already consume.
 *
 * Composite function: `min(sub-scores)`. Chosen for being the simplest
 * defensible aggregation — "we are as good as our weakest check." Any
 * sub-score of 0 zeroes the composite (matching today's hard-fail
 * behaviour). The default threshold of 0.0 preserves current behaviour
 * exactly: a fresh install behaves like the binary gate.
 */

import { CLAIM_MAX, type EntryKind } from "../schema/entry.ts";
import { scoreClaimAgainstEvidence } from "./grounding.ts";

const REASONING_MAX = 600;
const EVIDENCE_MIN = 1;
const EVIDENCE_MAX = 5;

export interface SubScores {
  schema_ok: number;
  length_ok: number;
  forbidden_kind: number;
  evidence_count: number;
  transcript_support: number;
  duplicate_risk: number;
}

export interface ScoreResult {
  sub_scores: SubScores;
  composite: number;
}

interface ScoreInput {
  kind: EntryKind;
  claim: string;
  reasoning: string;
  evidence: Array<{ quote: string }>;
}

const FORBIDDEN_PATTERNS: RegExp[] = [
  /\buser\s+(prefer|preferred|prefers|likes|wants|wanted|enjoys|hates|dislikes)\b/i,
  /\buser\s+(is|was|seems|feels|felt|believes|thinks)\b/i,
  /\b(user|the\s+user)['’]s\s+(personality|psychology|emotion|mood|background|identity)\b/i,
  /\babout\s+the\s+user\b/i,
];

function lengthScore(value: string, cap: number): number {
  if (value.length <= cap) return 1;
  // Linear decay from 1.0 at cap to 0.0 at 1.5×cap. Past 1.5×cap → 0.
  const overflow = value.length - cap;
  const ramp = cap * 0.5;
  return Math.max(0, 1 - overflow / ramp);
}

function forbiddenScore(claim: string, reasoning: string): number {
  for (const re of FORBIDDEN_PATTERNS) {
    if (re.test(claim) || re.test(reasoning)) return 0;
  }
  return 1;
}

function evidenceCountScore(n: number): number {
  return n >= EVIDENCE_MIN && n <= EVIDENCE_MAX ? 1 : 0;
}

function normaliseQuote(s: string): string {
  return s.replaceAll(/\s+/g, " ").trim().toLowerCase();
}

function transcriptSupportScore(
  candidate: ScoreInput,
  sourceContent: string,
): number {
  if (candidate.evidence.length === 0) return 0;
  const normalisedSource = normaliseQuote(sourceContent);
  let substringHits = 0;
  for (const e of candidate.evidence) {
    const q = normaliseQuote(e.quote);
    if (q.length > 0 && normalisedSource.includes(q)) substringHits++;
  }
  const substringFraction = substringHits / candidate.evidence.length;
  const grounding = scoreClaimAgainstEvidence(
    candidate.claim,
    candidate.evidence.map((e) => e.quote),
  );
  // Both halves must hold for full credit. Normalise the grounding score by
  // the floor so a barely-passing claim doesn't tank the sub-score.
  const groundingNormalised = Math.min(1, grounding.score / 0.5);
  return substringFraction * groundingNormalised;
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

function duplicateRiskScore(
  candidate: ScoreInput,
  activeClaims: Array<{ kind: EntryKind; claim: string }>,
): number {
  const claim = candidate.claim.trim().toLowerCase();
  let maxSim = 0;
  for (const e of activeClaims) {
    if (e.kind !== candidate.kind) continue;
    const sim = similarity(claim, e.claim.trim().toLowerCase());
    if (sim > maxSim) maxSim = sim;
  }
  return 1 - maxSim;
}

/**
 * Compute every sub-score and the min-composite for `candidate`. Pure: same
 * input → same output. Tests rely on this determinism.
 */
export function computeScores(
  candidate: ScoreInput,
  sourceContent: string,
  activeClaims: Array<{ kind: EntryKind; claim: string }>,
): ScoreResult {
  const sub_scores: SubScores = {
    schema_ok: 1,
    length_ok: Math.min(
      lengthScore(candidate.claim, CLAIM_MAX),
      lengthScore(candidate.reasoning, REASONING_MAX),
    ),
    forbidden_kind: forbiddenScore(candidate.claim, candidate.reasoning),
    evidence_count: evidenceCountScore(candidate.evidence.length),
    transcript_support: transcriptSupportScore(candidate, sourceContent),
    duplicate_risk: duplicateRiskScore(candidate, activeClaims),
  };
  const composite = Math.min(
    sub_scores.schema_ok,
    sub_scores.length_ok,
    sub_scores.forbidden_kind,
    sub_scores.evidence_count,
    sub_scores.transcript_support,
    sub_scores.duplicate_risk,
  );
  return { sub_scores, composite };
}
