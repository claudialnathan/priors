/**
 * /reflect: drift, appeasement, and stale-assumption check.
 *
 * Pure function over (entries, session events). Returns a list of flags,
 * each with a category and a one-line description.
 */

import type { Entry } from "../schema/entry.ts";
import type { SessionEvent } from "./log.ts";

export type ReflectFlag =
  | { kind: "appeasement"; description: string; reference?: string }
  | { kind: "repeated_rejection"; description: string; reference?: string }
  | { kind: "user_emotion_as_fact"; description: string; reference?: string }
  | { kind: "stale_freshness"; description: string; reference?: string }
  | { kind: "ignored_high_priority_rule"; description: string; reference: string }
  | { kind: "broad_one_off_rule"; description: string; reference: string }
  | { kind: "overstated_confidence"; description: string; reference: string };

export interface ReflectInput {
  entries: readonly { frontmatter: Entry["frontmatter"] }[];
  events: readonly SessionEvent[];
  /** ISO date used to assess freshness. */
  today: string;
  /** Maximum age in days before fast-moving topics get flagged. */
  freshnessHorizonDays?: number;
}

const EMOTIONAL_PATTERNS: readonly RegExp[] = [
  /\bfrustrat\w+/i,
  /\bannoy\w+/i,
  /\bhate\b/i,
  /\bstupid\b/i,
  /\b(awful|terrible|horrible)\b/i,
];

const FAST_MOVING_TAG_RE = /\b(next\.?js|nextjs|react|tailwind|fumadocs|claude code|claude-code|cursor|codex|vercel)\b/i;

const BROAD_RULE_PATTERNS: readonly RegExp[] = [
  /\balways\b/i,
  /\bnever\b/i,
  /\bevery time\b/i,
];

export function reflect(input: ReflectInput): ReflectFlag[] {
  const flags: ReflectFlag[] = [];
  const today = input.today;
  const horizon = input.freshnessHorizonDays ?? 90;

  // Scan entries for: emotional language, broad one-off rules, overstated confidence.
  for (const e of input.entries) {
    const fm = e.frontmatter;
    const ref = fm.readable_id ?? fm.id;

    for (const re of EMOTIONAL_PATTERNS) {
      if (re.test(fm.claim)) {
        flags.push({
          kind: "user_emotion_as_fact",
          description: `${ref} claim contains emotional language: ${fm.claim}`,
          reference: ref,
        });
        break;
      }
    }

    if (fm.kind === "rule" && fm.author === "agent" && fm.confidence === "high") {
      flags.push({
        kind: "overstated_confidence",
        description: `${ref} is an agent-authored rule marked confidence: high — review for evidence`,
        reference: ref,
      });
    }

    if (fm.kind === "rule") {
      const tagJoin = fm.tags.join(" ");
      const corpus = `${fm.claim} ${tagJoin}`;
      let broad = false;
      for (const re of BROAD_RULE_PATTERNS) {
        if (re.test(fm.claim)) {
          broad = true;
          break;
        }
      }
      // a rule with confidence:low and broad scope is suspicious
      if (broad && fm.confidence === "low") {
        flags.push({
          kind: "broad_one_off_rule",
          description: `${ref} broadens a one-off observation into a project-wide rule (confidence:low)`,
          reference: ref,
        });
      }
      if (FAST_MOVING_TAG_RE.test(corpus)) {
        const ageDays = daysBetween(today, fm.as_of);
        if (ageDays > horizon) {
          flags.push({
            kind: "stale_freshness",
            description: `${ref} concerns fast-moving tooling and was written ${ageDays}d ago — verify with current docs`,
            reference: ref,
          });
        }
      }
    }
  }

  // Scan session events for: pushback fatigue / repeated rejected approaches surfaced more than once.
  const pushbackRefs = new Map<string, number>();
  for (const ev of input.events) {
    if (ev.kind === "pushback") {
      const ref = String(ev.payload["reference"] ?? "");
      if (!ref) continue;
      pushbackRefs.set(ref, (pushbackRefs.get(ref) ?? 0) + 1);
    }
  }
  for (const [ref, n] of pushbackRefs) {
    if (n >= 2) {
      flags.push({
        kind: "repeated_rejection",
        description: `${ref} was used to push back ${n} times in this session — pattern likely recurring`,
        reference: ref,
      });
    }
  }

  // Detect appeasement: user expressed dissatisfaction and an agent-authored rule was created within the session.
  let userExpressedFrustration = false;
  for (const ev of input.events) {
    if (ev.kind === "user_log_intent") {
      const text = String(ev.payload["text"] ?? "");
      for (const re of EMOTIONAL_PATTERNS) {
        if (re.test(text)) userExpressedFrustration = true;
      }
    }
  }
  if (userExpressedFrustration) {
    flags.push({
      kind: "appeasement",
      description: `user expressed frustration during the session — review any new rules for whether they encode emotion as fact`,
    });
  }

  return flags;
}

function daysBetween(today: string, asOf: string): number {
  // both ISO YYYY-MM-DD; if invalid, return 0 to avoid spurious flags.
  const [y1, m1, d1] = today.split("-").map((s) => Number.parseInt(s, 10));
  const [y2, m2, d2] = asOf.split("-").map((s) => Number.parseInt(s, 10));
  if ([y1, m1, d1, y2, m2, d2].some((n) => !Number.isFinite(n))) return 0;
  const a = Date.UTC(y1!, (m1 ?? 1) - 1, d1 ?? 1);
  const b = Date.UTC(y2!, (m2 ?? 1) - 1, d2 ?? 1);
  return Math.max(0, Math.floor((a - b) / (24 * 3600 * 1000)));
}
