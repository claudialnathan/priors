/**
 * Significance gate: decides whether a candidate observation is durable
 * enough to log. The point is to keep auto-mode logging signal-rich and
 * avoid summarizing every message, every plan step, or every file change.
 *
 * Pure function. The heuristics are deliberately simple — when in doubt,
 * the gate refuses. False negatives are recoverable (the user can always
 * say "log this"); false positives bury the index in noise.
 */

import type { EntryKind } from "../schema/entry.ts";

export interface SignificanceCandidate {
  /** What we'd be logging. */
  claim: string;
  /** Best-guess kind. */
  kind: EntryKind;
  /** Source signals carried into the gate. Each one is optional. */
  signals: SignificanceSignals;
}

export interface SignificanceSignals {
  /** User explicitly asked to log this. Trumps every other signal. */
  userExplicit?: boolean;
  /** User authored the rule directly. */
  userAuthoredRule?: boolean;
  /** This change reverses or supersedes a prior decision. */
  superseded?: boolean;
  /** This was a rejected approach the agent or user noticed during work. */
  rejected?: boolean;
  /** Pre-commit checkpoint fired. */
  preCommit?: boolean;
  /** Pre-compact checkpoint fired. */
  preCompact?: boolean;
  /** Stop / SessionEnd checkpoint fired. */
  sessionEnd?: boolean;
  /** Recurring pattern observed (e.g. same correction more than once). */
  recurringCorrection?: boolean;
  /** Has at least one piece of evidence (transcript / diff / commit). */
  hasEvidence?: boolean;
}

export type SignificanceVerdict =
  | { decision: "log"; reasons: string[] }
  | { decision: "propose"; reasons: string[] }
  | { decision: "skip"; reasons: string[] };

/** Words/phrases that signal ephemeral chatter rather than durable knowledge. */
const NOISE_PATTERNS: readonly RegExp[] = [
  /^(ok|okay|cool|nice|got it|sure|yep|yes|no|maybe)[\.!\?]*$/i,
  /^thanks?\b/i,
  /^let me\b/i,
  /\bjust kidding\b/i,
  /\bnvm\b/i,
];

const FUTURE_AGENT_PHRASES: readonly RegExp[] = [
  /future agents? should/i,
  /next session/i,
  /so we don'?t repeat/i,
  /so it doesn'?t happen again/i,
  /handover/i,
];

/**
 * Apply the significance gate.
 *
 * Returns:
 * - `log` — write directly. Reserved for explicit user asks and user-authored rules.
 * - `propose` — add to the review queue (internally: stage). Default for auto-mode candidates.
 * - `skip` — drop. Default for low-signal candidates.
 */
export function classifySignificance(c: SignificanceCandidate): SignificanceVerdict {
  const reasons: string[] = [];
  const claim = c.claim.trim();

  if (!claim) {
    return { decision: "skip", reasons: ["empty claim"] };
  }
  if (claim.length < 12) {
    reasons.push("claim too short to carry meaning");
    return { decision: "skip", reasons };
  }
  for (const re of NOISE_PATTERNS) {
    if (re.test(claim)) return { decision: "skip", reasons: [`matched noise pattern: ${re}`] };
  }

  // user-explicit always wins
  if (c.signals.userExplicit) {
    reasons.push("user explicitly asked to log");
    if (c.signals.userAuthoredRule) reasons.push("user-authored rule");
    return { decision: "log", reasons };
  }
  if (c.signals.userAuthoredRule) {
    reasons.push("user-authored rule");
    return { decision: "log", reasons };
  }

  // strong agent-side signals → propose to the review queue
  let strong = 0;
  if (c.signals.superseded) {
    reasons.push("supersedes or contradicts a prior decision");
    strong++;
  }
  if (c.signals.rejected) {
    reasons.push("agent or user identified a rejected approach");
    strong++;
  }
  if (c.signals.recurringCorrection) {
    reasons.push("recurring correction observed");
    strong++;
  }
  if (c.kind === "failure" && c.signals.hasEvidence) {
    reasons.push("failure entry with evidence");
    strong++;
  }
  if (c.kind === "decision" && (c.signals.preCommit || c.signals.preCompact || c.signals.sessionEnd)) {
    reasons.push("decision surfaced at a meaningful checkpoint");
    strong++;
  }

  for (const re of FUTURE_AGENT_PHRASES) {
    if (re.test(claim)) {
      reasons.push("claim references future-agent value");
      strong++;
      break;
    }
  }

  if (!c.signals.hasEvidence && strong < 2) {
    return {
      decision: "skip",
      reasons: [
        "no transcript/diff/commit evidence and only weak signals",
        ...reasons,
      ],
    };
  }

  if (strong === 0) {
    return { decision: "skip", reasons: ["no strong significance signals"] };
  }

  return { decision: "propose", reasons };
}
