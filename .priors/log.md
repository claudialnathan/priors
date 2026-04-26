# Project log

A chronological view of meaningful state changes. Generated when the store updates; safe to read by hand.

## 2026-04-26

- Project store seeded at the v0.3 → v1 rejig. UUID `02292673-6731-4fb6-8776-194628bccff0`.
- Five initial decisions captured: TypeScript on Node 25, in-repo store, deterministic brief, stage-only distillation, MCP/CLI mirror.
- Five constraints captured: zero runtime deps, quote-or-refuse, 2,000-token brief ceiling, idempotent writes, no path traversal.
- One failure captured: v0.3 decay scoring + reinforcement counters + emit_constraint were rejected for v1 because curation, not retrieval gymnastics, is the product.
- Three open questions raised: rename migration, long-source chunking, contested-resolution UX.
