/**
 * Deterministic grounding checks. No LLM scoring lives here — only token-set
 * overlap between a claim and the evidence quotes that should support it.
 *
 * The point of this module is to make "the claim is grounded in the source"
 * mean something programmatically falsifiable. The verbatim-substring check
 * for evidence quotes already lives in stage.ts; this module adds the second
 * half: that the claim itself is non-trivially related to those quotes.
 */

/**
 * Tokens shorter than this are filtered out to suppress stopword noise
 * ("the", "and", "for", "are"...). Set to 4 specifically so that
 * grounding signal is carried by content words, not function words —
 * a claim sharing only "the" with its evidence should not pass.
 */
const TOKEN_MIN_LEN = 4;

export const GROUNDING_FLOOR = 0.15;

export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= TOKEN_MIN_LEN);
}

export function tokenSet(text: string): Set<string> {
  return new Set(tokenise(text));
}

/**
 * Dice coefficient on token sets. Symmetric, in [0, 1]. Equal sets → 1.
 * Disjoint sets → 0. Matches the formula used by stage.ts's existing
 * similarity() so a single notion of "similar" is reused.
 */
export function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return (2 * inter) / (a.size + b.size);
}

export interface GroundingResult {
  score: number;
  passes: boolean;
  /** Claim tokens not found in any evidence quote. */
  unsupportedTokens: string[];
}

/**
 * Score a claim's grounding in the union of its evidence quotes. Returns the
 * dice coefficient and the list of claim tokens that don't appear in any
 * quote (used to populate `unsupported_substrings` on reject events).
 */
export function scoreClaimAgainstEvidence(
  claim: string,
  evidenceQuotes: string[],
  floor: number = GROUNDING_FLOOR,
): GroundingResult {
  const claimTokens = tokenSet(claim);
  const evidenceTokens = new Set<string>();
  for (const q of evidenceQuotes) {
    for (const t of tokenise(q)) evidenceTokens.add(t);
  }
  const score = diceCoefficient(claimTokens, evidenceTokens);
  const unsupported: string[] = [];
  for (const t of claimTokens) {
    if (!evidenceTokens.has(t)) unsupported.push(t);
  }
  unsupported.sort();
  return {
    score,
    passes: score >= floor,
    unsupportedTokens: unsupported,
  };
}
