/**
 * Pushback formatter: when an agent recognizes a user proposal as something
 * already tried and rejected (or in conflict with an active rule), it
 * responds in a fixed format so the user can recognise the shape and decide
 * whether to override.
 *
 * Pure function — agents call this with the matched priors and an alternative.
 */

import type { EntryKind } from "../schema/entry.ts";

export interface PushbackPrior {
  /** Readable id like "F-004" or canonical id as fallback. */
  reference: string;
  title: string;
  kind: EntryKind;
  /** Date the prior was logged. */
  date: string;
  /** Optional one-line consequence — surfaced in the pushback body. */
  consequence?: string;
}

export interface PushbackInput {
  /** What event happened — "we reviewed the human-invoked entry flow", etc. */
  attempt: string;
  /** The negative outcome that resulted. */
  outcome: string;
  /** When the original event happened (ISO date). */
  date: string;
  /** One or more priors that establish the rejection. The first one anchors the body. */
  priors: PushbackPrior[];
  /** Recommended alternative path. */
  alternative: string;
}

/**
 * Render a pushback message in the canonical format. Always emits the same
 * shape so users can scan it quickly.
 */
export function formatPushback(input: PushbackInput): string {
  if (input.priors.length === 0) {
    throw new Error("formatPushback: at least one prior is required");
  }
  const lines: string[] = [];
  lines.push("This approach has been tried and rejected.");
  lines.push("");
  lines.push(`On ${input.date}, ${input.attempt.trim()}, which led to ${input.outcome.trim()}.`);
  lines.push("");
  lines.push("Relevant prior:");
  for (const p of input.priors) {
    const tail = p.consequence ? ` — ${p.consequence}` : "";
    lines.push(`- ${p.reference}: ${p.title}${tail}`);
  }
  lines.push("");
  lines.push(`I recommend ${input.alternative.trim()} instead.`);
  return lines.join("\n");
}

/**
 * Render a compact reference for an entry as it appears in /recall, /why, /impact:
 *   F-004 — Manual UUID retrieval made the UX unusable
 *   Date: 2026-04-28
 *   Consequence: Future agents should avoid human-facing flows that require raw entry IDs.
 */
export function formatEntryReference(p: PushbackPrior): string {
  const lines = [`${p.reference} — ${p.title}`, `Date: ${p.date}`];
  if (p.consequence) lines.push(`Consequence: ${p.consequence}`);
  return lines.join("\n");
}
