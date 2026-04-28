/**
 * Natural-language detection of "log this to Priors" intent in user prompts.
 *
 * Pure function: takes the user prompt, returns a classification with the
 * detected kind and a confidence label. Lives behind a regex to avoid LLM
 * cost in the UserPromptSubmit hook path. False negatives are fine; agents
 * still log via /log when intent is ambiguous. False positives are worse,
 * so the matcher requires a clear verb-and-object phrase.
 */

import type { EntryKind } from "../schema/entry.ts";

export type LogIntentKind = EntryKind | "note";

export interface LogIntent {
  matched: true;
  /** Best-guess entry kind to use if the user does not name one. */
  suggestedKind: LogIntentKind;
  /** Trigger phrase (lowercased substring) that the matcher locked onto. */
  trigger: string;
  /** "high" if the user clearly says log/remember; "medium" if inferred from kind word. */
  strength: "high" | "medium";
  /** True if the user is asserting a rule (high-priority, user-authored direct write). */
  ruleAssertion: boolean;
}

export interface NoIntent {
  matched: false;
}

export type LogIntentResult = LogIntent | NoIntent;

/** Phrases that explicitly request a write. Keep narrow to avoid false positives. */
const HIGH_TRIGGERS: readonly string[] = [
  "log this",
  "log that",
  "add this to priors",
  "add that to priors",
  "add this to project memory",
  "add this to the project memory",
  "make sure priors remembers this",
  "make sure priors remembers that",
  "make sure future agents remember this",
  "make sure future agents remember that",
  "remember this",
  "save this to priors",
  "store this in priors",
  "record this in priors",
  "priors-log",
  "priors log",
  "/log",
  "/priors-log",
];

/**
 * Phrases asserting a rule. Higher priority than generic log triggers because
 * they imply user-authored, high-priority write.
 */
const RULE_TRIGGERS: readonly string[] = [
  "this is a rule",
  "make this a rule",
  "add a rule:",
  "add a rule —",
  "add a rule -",
  "add this as a rule",
  "/rule",
];

/** Phrases asserting a failed approach (don't repeat this). */
const FAILURE_TRIGGERS: readonly string[] = [
  "we tried this and it failed",
  "this approach failed",
  "we already tried",
  "don't let this happen again",
  "do not let this happen again",
  "this didn't work",
  "this did not work",
];

/** Phrases asserting a constraint or invariant. */
const CONSTRAINT_TRIGGERS: readonly string[] = [
  "always do this",
  "never do this",
  "this must hold",
  "this is a constraint",
  "this constraint",
];

/** Phrases asserting a decision. */
const DECISION_TRIGGERS: readonly string[] = [
  "we decided",
  "we've decided",
  "we have decided",
  "decision:",
  "decided to",
];

/** Phrases asserting an open question to remember. */
const QUESTION_TRIGGERS: readonly string[] = [
  "open question:",
  "remember this question",
  "this question is open",
];

/**
 * Detect a Priors log intent in `text`. Returns `{matched: false}` if nothing
 * looks like an explicit write request. Order matters: rule > failure >
 * constraint > decision > question > generic note.
 */
export function detectLogIntent(text: string): LogIntentResult {
  const lower = text.toLowerCase();

  for (const t of RULE_TRIGGERS) {
    if (lower.includes(t)) {
      return { matched: true, suggestedKind: "rule", trigger: t, strength: "high", ruleAssertion: true };
    }
  }
  for (const t of FAILURE_TRIGGERS) {
    if (lower.includes(t)) {
      return { matched: true, suggestedKind: "failure", trigger: t, strength: "high", ruleAssertion: false };
    }
  }
  for (const t of CONSTRAINT_TRIGGERS) {
    if (lower.includes(t)) {
      return { matched: true, suggestedKind: "constraint", trigger: t, strength: "medium", ruleAssertion: false };
    }
  }
  for (const t of DECISION_TRIGGERS) {
    if (lower.includes(t)) {
      return { matched: true, suggestedKind: "decision", trigger: t, strength: "medium", ruleAssertion: false };
    }
  }
  for (const t of QUESTION_TRIGGERS) {
    if (lower.includes(t)) {
      return { matched: true, suggestedKind: "question", trigger: t, strength: "medium", ruleAssertion: false };
    }
  }
  for (const t of HIGH_TRIGGERS) {
    if (lower.includes(t)) {
      return { matched: true, suggestedKind: "note", trigger: t, strength: "high", ruleAssertion: false };
    }
  }
  return { matched: false };
}
