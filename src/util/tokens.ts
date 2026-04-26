/**
 * Conservative, dependency-free token approximation.
 * `ceil(chars / 4)` overcounts slightly for English, which biases brief
 * assembly toward staying under the 2,000-token budget. See the entry
 * `pri-20260426-brief-token-ceiling` for context.
 */
export function approxTokens(text: string): number {
  if (typeof text !== "string" || text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}
