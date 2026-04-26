---
id: pri-20260426-quote-or-refuse
kind: constraint
status: active
confidence: high
as_of: 2026-04-26
created_at: 2026-04-26T05:30:00Z
updated_at: 2026-04-26T05:30:00Z
claim: "Every staged claim must be supported by a verbatim quote from the source content, verified by code substring match. No exceptions, no fast path."
relations:
  supersedes: []
  contradicts: []
  reinforces:
    - pri-20260426-stage-only-distillation
  derived_from: []
tags:
  - distillation
  - safety
  - verification
---

## Why

The single guarantee that makes Priors trustworthy: no claim leaves distillation without a quote that supports it. The verification step is implemented in code, not in the prompt, because prompts can be drifted, jailbroken, or routed around. Substring matching cannot.

## How it is enforced

- `stage_learning` runs the verification pass in `src/distill/verify.ts` after the model produces candidates.
- Each `evidence.quote` must appear verbatim in `source_content`. Whitespace is normalized; case is preserved.
- Any candidate that fails is dropped from the staged pool and appended to `audit/distillation-rejects.log` with the reason.
- Forbidden kinds (user preference, identity, psychology) are dropped at the same stage.
- High-confidence candidates additionally require non-trivial substring overlap between the strongest quote and the claim.

## Risks of relaxing this

If we add a fast path, it will be the path that gets used. The verification cost is the price of trust.
