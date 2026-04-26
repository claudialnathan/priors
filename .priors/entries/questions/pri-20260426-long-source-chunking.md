---
id: pri-20260426-long-source-chunking
kind: question
status: active
confidence: medium
as_of: 2026-04-26
created_at: 2026-04-26T05:30:00Z
updated_at: 2026-04-26T05:30:00Z
claim: "How should stage_learning handle source content that exceeds ~32K tokens? Per-chunk distillation with a merge step, or refuse and require manual chunking?"
relations:
  supersedes: []
  contradicts: []
  reinforces: []
  derived_from: []
tags:
  - distillation
  - scale
  - prompt
---

## What's known

- `docs/specs/staged-distillation.md` § "What this spec does not yet decide" notes long-source chunking is unresolved.
- The verification step is per-candidate, so chunking is independent of verification.
- Real-world transcripts of multi-hour sessions easily exceed 32K tokens.

## Options

- **A. Refuse and instruct.** If `source_content` exceeds a threshold, return an error asking the user to chunk manually. Simple, brittle.
- **B. Internal chunking with merge.** The tool chunks at section boundaries (markdown headings, tool-call boundaries), distills each, then deduplicates candidates by claim similarity before staging. Adds complexity to the verifier.
- **C. Soft cap with warning.** Accept oversized input but warn that recall may miss claims spread across chunks.

## Resolution path

This blocks Phase 4 once we have real long-source test fixtures. For now, set a soft cap of 32K tokens and refuse above it (option A). Revisit when the regression suite has a >32K fixture.
