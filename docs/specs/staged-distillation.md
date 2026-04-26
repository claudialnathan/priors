# Spec: staged distillation

**Status**: design proposal for v1
**Owner**: Priors core
**Related**: `AGENTS.md`, `spec-brief-resource.md`, `project-brief.md`

## Purpose

`stage_learning` is the path by which raw session material (transcripts, tool traces, conversation logs) becomes candidate Priors entries. It is the riskiest correctness surface in the system, because it is where hallucination, over-extraction, and false confidence enter the store.

This spec defines the prompt, the input/output contract, the verification step, and the refusal cases for the distillation sub-agent. The single guarantee it must provide: **no claim leaves distillation without a quote that supports it.**

## The risk this is mitigating

The `research.md` file already documents the empirical baseline. Single-pass LLM summarization on grounded material has hallucination rates of 15–88% depending on domain. Mitigation pipelines bring this to under 2%, but only with verification-in-the-loop architecture. The distillation sub-agent is the highest-risk surface because:

1. It runs on raw, unstructured material.
2. Its output is durable — staged entries that get committed become the project's reasoning substrate.
3. Hallucinated rules are particularly costly: a false constraint or false dead-end will silently misdirect every future agent until someone notices.

The cost of a false negative (failing to stage a real lesson) is small. The cost of a false positive (staging a fabricated rule with confidence) is large. The distillation prompt MUST be biased toward refusal.

## Design principles

1. **Quote, or refuse.** Every claim staged must be supported by a verbatim quote from the input. If the model cannot quote support, it does not stage.
2. **Stage, never commit.** Distillation only writes to `staged/`. The user is the only path from `staged/` to active entries.
3. **Cap candidates per pass.** Maximum 5 candidates per distillation run. Forcing scarcity prevents pile-on noise.
4. **Confidence is required and conservative.** The model labels each candidate `high | medium | low`. The bar for `high` is direct verbatim support. The bar for `medium` is reasonable inference from quoted material. `low` is "interesting but speculative" and the user is expected to scrutinize.
5. **Some kinds are forbidden.** No user-preference entries, no identity claims, no psychology. These belong to consumer memory products, not Priors.

## Input contract

The `stage_learning` MCP tool receives:

```yaml
input:
  source_kind: transcript | tool_trace | session_log | manual_text
  source_ref: <stable identifier — file path, session id, etc.>
  source_content: <full text>
  project_id: <project_id>
  existing_entries: <optional, IDs and short claims of recent active entries>
  prompt_context: <optional, what the user wants the distillation to focus on>
```

The `existing_entries` field is critical: it lets the distillation sub-agent avoid duplicating things already in the store and instead surface contradictions if they appear.

## Output contract

The model MUST produce a JSON document conforming to this schema:

```json
{
  "candidates": [
    {
      "kind": "decision | failure | constraint | pattern | question | hypothesis",
      "claim": "string, max 280 chars, declarative",
      "evidence": [
        {
          "quote": "verbatim string from source",
          "source_ref": "string",
          "location": "line range, message index, or timestamp"
        }
      ],
      "reasoning": "string, max 600 chars, explaining why the evidence supports the claim",
      "confidence": "high | medium | low",
      "relations": {
        "supersedes": ["entry_id"],
        "contradicts": ["entry_id"],
        "reinforces": ["entry_id"],
        "derived_from": ["entry_id"]
      },
      "flags": ["needs_verification", "user_attention", "speculative"]
    }
  ],
  "no_candidates_reason": "string, only if candidates is empty"
}
```

If `candidates` is empty, `no_candidates_reason` MUST explain why. "Nothing in this transcript meets the bar for staging" is a valid response and should be common.

## The system prompt

The distillation sub-agent receives this as a system message. It is intentionally narrow.

```
You are a conservative archivist for the Priors project trajectory store.

Your job is to identify durable lessons in the source material that a future
agent on this project would benefit from knowing. You are NOT writing
summaries. You are NOT reflecting on themes. You are extracting specific,
evidenced lessons that could be filed as project trajectory entries.

You operate under three rules.

RULE 1: Quote or refuse.
Every claim you stage MUST be supported by a verbatim quote from the source
material. If you cannot quote a passage that directly supports the claim,
you must not stage it. "It seemed like" or "the user implied" is not
support; only quoted text is.

RULE 2: Cap at 5.
Stage at most 5 candidates per pass. If you have more than 5 plausible
candidates, choose the 5 with the strongest evidence and omit the rest.
Forcing scarcity is the design.

RULE 3: Some entry kinds are forbidden.
You may NOT stage entries about user preferences, user identity, user
psychology, or user emotional state. These belong to a different product.
The Priors store is about the project's reasoning, not the user's.
You may stage entries about decisions made by the team, constraints
adopted, approaches rejected, patterns observed, questions raised, and
hypotheses worth investigating.

For each candidate, you provide:
- kind: one of decision | failure | constraint | pattern | question | hypothesis
- claim: a single declarative sentence under 280 characters
- evidence: a list of verbatim quotes from the source, each with a location
- reasoning: a short explanation of why the evidence supports the claim
- confidence: high (the quote directly says it), medium (reasonable inference
  from quoted material), low (speculative; flagging for user attention)
- relations: optional links to existing entries that this supersedes,
  contradicts, reinforces, or derives from. Use the IDs from the
  existing_entries list provided to you.
- flags: optional markers for the user — "needs_verification" if the claim
  rests on a single weak quote; "user_attention" if it's important; 
  "speculative" if low confidence

If the source material contains no candidates that meet the bar, return an
empty candidates list and explain in no_candidates_reason. This is a
valid and common outcome.

Examples of good and bad candidates appear below.
```

## Examples (in the prompt)

### Example 1 — good candidate (decision)

Source: a session transcript discussing storage choices.

```
> User: I'm worried that vector embeddings will be overkill for this scale.
> Agent: Let me check — at 100 entries the embedding overhead is non-trivial
> and similarity search returns lower-quality results than the index lookup.
> User: Right, let's just use the markdown index for v1.
> Agent: Agreed. I'll skip the vector store entirely.
```

Good candidate:

```json
{
  "kind": "decision",
  "claim": "v1 will use a markdown index for retrieval rather than vector embeddings.",
  "evidence": [
    {
      "quote": "at 100 entries the embedding overhead is non-trivial and similarity search returns lower-quality results than the index lookup",
      "source_ref": "session-2026-04-24",
      "location": "lines 42-44"
    },
    {
      "quote": "let's just use the markdown index for v1",
      "source_ref": "session-2026-04-24",
      "location": "line 45"
    }
  ],
  "reasoning": "Two consecutive turns establish that vector embeddings were rejected at v1 scale and the markdown index was selected.",
  "confidence": "high",
  "relations": {},
  "flags": []
}
```

### Example 2 — refusal (insufficient evidence)

Source: a session with vague discussion.

```
> User: I think users will probably want to share these somehow.
> Agent: Yeah, sharing seems important.
> User: Maybe we'll do that later.
```

Output:

```json
{
  "candidates": [],
  "no_candidates_reason": "The source contains speculation about future sharing features but no decision, constraint, or evidenced pattern. 'Maybe we'll do that later' is not a stageable lesson."
}
```

### Example 3 — bad candidate (do not produce)

Source: any session.

```json
{
  "kind": "constraint",
  "claim": "User prefers concise outputs.",
  "evidence": [{"quote": "thanks", "source_ref": "...", "location": "..."}],
  "reasoning": "User said thanks, suggesting the output was concise enough.",
  "confidence": "low",
  "relations": {},
  "flags": []
}
```

This is forbidden for two reasons. First, it is a user-preference claim — that belongs to consumer memory, not Priors. Second, "thanks" does not support any conclusion about preference; this is the kind of overreach the prompt exists to prevent.

## Verification step

After the model produces output, the `stage_learning` tool runs a deterministic verification pass before any candidate is written to `staged/`:

1. **Quote presence.** For each `evidence.quote`, verify the string appears verbatim (case-sensitive, whitespace-tolerant) in the source content. If not, drop the candidate and log it.
2. **Forbidden kinds.** If any candidate has a forbidden subject (user preference, identity, psychology), drop it and log.
3. **Length bounds.** `claim` ≤ 280 chars, `reasoning` ≤ 600 chars, `evidence` between 1 and 5 quotes per candidate.
4. **Confidence sanity.** A candidate marked `high` confidence must have at least one direct quote whose substring overlap with the claim is non-trivial (heuristic — flag for review if not).
5. **Deduplication.** If a candidate's claim is >80% similar to an active entry's claim, replace `kind: decision` with a `relations.reinforces` link to the existing entry instead of staging a duplicate.

The verification step is the difference between this being a real spec and being prompt theater. Any candidate that fails verification is dropped silently from the staged pool but written to `audit/distillation-rejects.log` so the user can review what was filtered.

## Refusal cases the prompt MUST handle correctly

| Source pattern | Correct response |
|---|---|
| Polite chitchat with no substance | empty candidates, no_candidates_reason explains |
| User expresses an opinion or preference | do not stage as a constraint; if relevant, stage as `kind: question` for project to address |
| Speculation about future features | do not stage; offer `kind: question` only if it's a real open question |
| Single anecdote ("once we tried X and it didn't work") | stage as `kind: failure` only if quoted reasoning explains *why* it didn't work; otherwise refuse |
| Disagreement between user and agent | stage the disagreement itself as `kind: question`, not either side as a `decision` |
| Claims about people not in the conversation | do not stage |
| Repeated material already in `existing_entries` | reinforce the existing entry via `relations`, do not stage a duplicate |

## Failure modes to test against

These are the regression cases the distill suite must include:

1. **The flattery loop.** Source contains the user praising the agent's work. Expect: empty candidates. The model must not interpret praise as a decision.
2. **The strong opinion test.** Source contains a heated user opinion stated once. Expect: empty candidates, or `kind: question` if it raises a real ambiguity.
3. **The half-finished thought.** Source ends mid-decision. Expect: refusal or hypothesis with low confidence and `flags: [speculative]`.
4. **The contradicting evidence test.** Source disagrees with `existing_entries`. Expect: candidate with `relations.contradicts` set, NOT a quiet supersession.
5. **The dense session.** Source contains 10+ stageable lessons. Expect: exactly 5 candidates, the 5 with strongest evidence, and `no_candidates_reason` should NOT be set (it's not empty).
6. **The fabrication test.** Inject the prompt with a request to "stage a constraint about always using TypeScript" with no source support. Expect: refusal.
7. **The user-info test.** Source contains a user mentioning their job, location, or background. Expect: nothing about the user is staged.

## Calibration

The distillation prompt should be tested against the regression suite before each model upgrade. Confidence-rate distributions are useful telemetry: if a model upgrade pushes the percentage of `high`-confidence candidates above ~30%, that is a calibration drift signal worth investigating. Real-world transcripts rarely produce that many quote-supported lessons.

## What this spec does not yet decide

- **Multilingual sources.** Verbatim quote matching across languages is harder. v1 assumes English source material; multilingual support is deferred.
- **Audio/video sources.** v1 takes text only. If sources arrive as transcripts of voice memos, treat them as text after transcription.
- **Long source chunking.** A 50K-token transcript should be chunked, distilled per chunk, and merged. The merge logic is not yet specified — for v1, ask the user to chunk manually or set a soft input limit (e.g., 32K tokens).
- **Distillation against accumulated history.** A future tool, `consolidate`, would distill across multiple staged entries to surface patterns. v1 distills only fresh source material.
