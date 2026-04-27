/**
 * Adversarial fixtures for the quote-or-refuse grounding check.
 *
 * Each fixture is a synthetic source transcript paired with a deliberately-
 * hallucinated candidate. In strict mode every candidate must be rejected.
 * In warn mode, ungrounded_claim cases are staged with a grounding_warning
 * flag; quote_not_in_source and forbidden_kind cases still reject (the
 * substring check fails closed regardless of mode).
 */

export type ExpectedReason =
  | "quote_not_in_source"
  | "ungrounded_claim"
  | "forbidden_kind";

export interface AdversarialFixture {
  name: string;
  source: string;
  candidate: Record<string, unknown>;
  expectedReason: ExpectedReason;
}

export const FIXTURES: AdversarialFixture[] = [
  {
    name: "made_up_quote",
    source: "We chose Postgres because we already run it for billing.",
    candidate: {
      kind: "decision",
      claim: "Use Postgres for the new service.",
      reasoning: "The team picked Postgres for its operational familiarity.",
      confidence: "medium",
      evidence: [
        {
          quote: "we will use Postgres for everything going forward",
          source_ref: "meeting-notes",
          location: "line 4",
        },
      ],
    },
    expectedReason: "quote_not_in_source",
  },
  {
    name: "claim_drift",
    source:
      "We chose Postgres because we already run it for billing.\nLatency requirements remain p99 under 200ms.",
    candidate: {
      kind: "decision",
      claim: "Migrate everything to a global key-value store immediately.",
      reasoning: "The team aligned on a major rewrite.",
      confidence: "high",
      evidence: [
        {
          quote: "We chose Postgres because we already run it for billing.",
          source_ref: "meeting-notes",
          location: "line 1",
        },
      ],
    },
    expectedReason: "ungrounded_claim",
  },
  {
    name: "forbidden_user_claim",
    source: "User prefers concise responses with bullet points.",
    candidate: {
      kind: "pattern",
      claim: "User prefers concise bullet-point responses.",
      reasoning: "Repeated requests indicate this preference.",
      confidence: "medium",
      evidence: [
        {
          quote: "User prefers concise responses with bullet points.",
          source_ref: "log-001",
          location: "line 1",
        },
      ],
    },
    expectedReason: "forbidden_kind",
  },
  {
    name: "subtle_word_swap",
    source: "Tests run on every commit; failures block the merge.",
    candidate: {
      kind: "constraint",
      claim: "Tests run on every push; failures block the deploy.",
      reasoning: "Continuous integration requirement.",
      confidence: "high",
      evidence: [
        {
          quote: "tests run on every push; failures block the deploy.",
          source_ref: "ci-spec",
          location: "section 2",
        },
      ],
    },
    expectedReason: "quote_not_in_source",
  },
  {
    name: "whitespace_quote",
    source: "We agreed to defer the schema migration to next quarter.",
    candidate: {
      kind: "decision",
      claim: "Defer the schema migration.",
      reasoning: "Delivery pressure on the next release.",
      confidence: "medium",
      evidence: [
        {
          quote: "    \n  ",
          source_ref: "minutes-q1",
          location: "line 7",
        },
      ],
    },
    expectedReason: "quote_not_in_source",
  },
  {
    name: "claim_overreach",
    source:
      "We picked websockets for the trading view because of its sub-second updates.",
    candidate: {
      kind: "pattern",
      claim: "Build all real-time features on a single shared bus.",
      reasoning: "Standardising the transport reduces operational load.",
      confidence: "medium",
      evidence: [
        {
          quote:
            "We picked websockets for the trading view because of its sub-second updates.",
          source_ref: "design-doc",
          location: "section 1",
        },
      ],
    },
    expectedReason: "ungrounded_claim",
  },
  {
    name: "mixed_legit_and_fake",
    source:
      "We chose Postgres because we already run it for billing.\nLatency requirements remain p99 under 200ms.",
    candidate: {
      kind: "decision",
      claim: "Use Postgres because of operational familiarity.",
      reasoning: "Billing already runs on it.",
      confidence: "medium",
      evidence: [
        {
          quote: "We chose Postgres because we already run it for billing.",
          source_ref: "meeting-notes",
          location: "line 1",
        },
        {
          quote: "and we will rewrite the auth layer in Rust by Q3",
          source_ref: "meeting-notes",
          location: "line 8",
        },
      ],
    },
    expectedReason: "quote_not_in_source",
  },
  {
    // Note: lexical grounding cannot detect semantic negation when the claim
    // shares most content words with its evidence (e.g. "ship X before Y" vs
    // "postpone X until after Y" → dice ≈ 0.5, passes). This fixture instead
    // tests claim/evidence drift where the claim uses distinct vocabulary.
    name: "unrelated_directive",
    source: "We agreed to ship the migration before the conference.",
    candidate: {
      kind: "decision",
      claim: "Delay the product launch indefinitely.",
      reasoning: "Quality concerns warrant pushing the date out.",
      confidence: "medium",
      evidence: [
        {
          quote: "We agreed to ship the migration before the conference.",
          source_ref: "minutes",
          location: "line 1",
        },
      ],
    },
    expectedReason: "ungrounded_claim",
  },
  {
    name: "wholly_fabricated",
    source: "Routine maintenance window: Thursday 2-4am UTC.",
    candidate: {
      kind: "decision",
      claim: "Adopt a four-day work week starting next month.",
      reasoning: "Improves morale and retention.",
      confidence: "high",
      evidence: [
        {
          quote: "the team agreed to a four-day work week starting next month",
          source_ref: "memo",
          location: "paragraph 1",
        },
      ],
    },
    expectedReason: "quote_not_in_source",
  },
  {
    name: "claim_about_unrelated_topic",
    source:
      "We agreed to use semantic versioning for all new packages going forward.",
    candidate: {
      kind: "constraint",
      claim: "Build artifacts must be reproducible byte-for-byte across machines.",
      reasoning: "Reproducibility is essential for supply-chain trust.",
      confidence: "medium",
      evidence: [
        {
          quote:
            "We agreed to use semantic versioning for all new packages going forward.",
          source_ref: "rfc-014",
          location: "summary",
        },
      ],
    },
    expectedReason: "ungrounded_claim",
  },
];
