# Spec: `priors://brief`

**Status**: design proposal for v1
**Owner**: Priors core
**Related**: `AGENTS.md`, `spec-staged-distillation.md`, `project-brief.md`

## Purpose

`priors://brief` is the orientation surface a fresh agent (or human) reads first when entering a Priors-equipped project. It is the highest-frequency interaction in the system, and the single most important output to get right. If the brief is wrong — too long, too vague, too compressed, hallucinated — the rest of Priors does not matter, because no one will trust the layer underneath it.

The brief is not a memory dump. It is not a model-generated summary. It is a deterministic, bounded, IDs-only assembly that tells the reader what the project is doing, what it has decided, what it has tried and rejected, and what to look at next.

## Design principles

1. **Deterministic, not generated.** The brief is assembled from indexes by code, not written by a model. A model may post-format, but the source-of-truth content is mechanical. This guarantees reproducibility and prevents the "compression chooses wrong" failure mode that consumer memory products suffer from.
2. **IDs and one-liners, not bodies.** The brief shows entry IDs and short claims. Full bodies are fetched separately via `priors://entry/{id}`. This is the progressive-disclosure pattern at its strictest.
3. **Bounded by tokens, not by truth.** The brief has a hard token ceiling. If there is more material than fits, the assembly drops the lowest-priority items per section and notes that it did so. There is no "extended brief" version. If you want more, drill down.
4. **Stable structure across populations.** Empty stores and rich stores produce briefs of the same shape, with empty sections rendered explicitly rather than omitted. This makes the brief predictable as an interface.
5. **Time-aware, not present-tense.** Every claim shown is dated. The reader can always tell when something was last confirmed.

## Output format

The brief is a markdown document. The skeleton:

```markdown
# Project trajectory brief
Project: <project_name> (id: <project_id>)
Generated: <ISO timestamp>
Last activity: <relative>
Total entries: <n active> active, <n staged> staged, <n superseded> superseded

## Current state
<1–3 sentences, drawn from the most recent active "state" entry if one exists.
If none exists, this section says: "No state entry recorded. Use `priors stage --kind state` to add one.">

## Active decisions
<up to 7 entries, each one line:>
- `<id>` <short claim> (as_of <date>, confidence: <h|m|l>)

## Active constraints
<all constraints, no cap; if more than 12, sort by recency and append "…and N more">
- `<id>` <short claim>

## Open questions
<up to 5 most recent>
- `<id>` <short claim> (raised <date>)

## Contested or under review
<all entries with status: contested>
- `<id>` <claim>; challenged by `<id>` <date>

## Recently superseded (last 14 days)
<all supersession events in window>
- `<old_id>` <old claim> → `<new_id>` <new claim> (<date>)

## Known dead ends (most relevant 5)
<entries with kind: failure, ranked by recency × link-count>
- `<id>` <approach>; rejected because <one-line reason>

## Suggested next moves
<up to 3 entries with kind: question that have status: action_pending,
or pull from the most recent active "state" entry's "next" field>

## How to fetch more
- Full entry:    priors://entry/{id}
- Evidence:      priors://audit/{id}
- Chronology:    priors://log
- Search:        recall(query, filters)
```

## Token budget

Hard ceilings, enforced by the assembly code:

| Section | Max tokens | Action on overflow |
|---|---|---|
| Header | 80 | Truncate `last activity` precision |
| Current state | 120 | Truncate; append `…` |
| Active decisions | 350 | Drop lowest-confidence first |
| Active constraints | 300 | Sort by recency; append "…and N more" |
| Open questions | 200 | Show 5 most recent |
| Contested | 200 | Show all in section if 5 or fewer; otherwise top 5 by recency + "…and N more" |
| Recently superseded | 250 | Window is 14 days, no further cap; if section exceeds 250 tokens, narrow window to 7 days and note this |
| Dead ends | 250 | Top 5 by relevance score |
| Next moves | 150 | Top 3 |
| Footer | 80 | Fixed |

Total ceiling: **~2000 tokens**. The brief MUST fit in this budget. If it doesn't, the assembly fails the test suite and the bug is in the assembly, not the data.

## Assembly logic

For each section, the deterministic ranking rule:

- **Active decisions**: filter `status == active && kind == decision`. Sort by `confidence desc, updated_at desc`. Take top 7.
- **Active constraints**: filter `status == active && kind == constraint`. Sort by `updated_at desc`. Take all up to budget; otherwise count overflow.
- **Open questions**: filter `status == active && kind == question`. Sort by `created_at desc`. Take 5.
- **Contested**: filter `status == contested`. Take all unless over 5; then top 5 by recency.
- **Recently superseded**: filter for entries with relation `supersedes` where `updated_at > now - 14d`. No further cap.
- **Dead ends**: filter `kind == failure && status == active`. Score: `0.6 * recency_decay(updated_at) + 0.4 * inbound_link_count`. Take top 5.
- **Suggested next moves**: filter `kind == question && status == action_pending`. Take 3 most recent. If none, fall back to the most recent state entry's `next` field.

`recency_decay(t) = exp(-(now - t) / 30 days)`. This is a soft prior, not aggressive decay; it just helps recent failures rank above ancient ones at equal link count.

## Edge cases

**Empty store.** Every section renders with a placeholder pointing to the relevant `priors stage` command. The brief is still a useful artifact — it tells the new arrival what they could do.

**Single-entry store.** Same; only the relevant section populates.

**Conflicting active decisions** (rare, but possible during contested periods). Both appear in `Active decisions`, each tagged with `(contested with <id>)`. The Contested section also lists the pair.

**Project with no `as_of` dates** (legacy). Entries without `as_of` are shown with `as_of: unknown`. A health warning at the bottom of the brief notes the count.

**Project with stale data** (no activity > 30 days). A small `(stale)` marker after the timestamp. The brief still renders normally.

## What MUST NOT appear in the brief

- Full entry bodies. The brief shows claims, never reasoning.
- Source quotes. Those live in `priors://audit/{id}`.
- Personal information about the user, even if stored elsewhere.
- Model-generated commentary on the entries. The model may rephrase the assembled output for tone, but it MUST NOT add interpretation.
- Inferred or computed claims that aren't in any entry. The brief reflects the store, period.

If the assembly is tempted to "summarize across decisions" or "infer the project's current direction," it is doing the wrong thing. That synthesis is the next agent's job, not the brief's.

## Two example briefs

### Empty store

```markdown
# Project trajectory brief
Project: priors-vnext (id: prj-7f3a-de4b)
Generated: 2026-04-26 14:32 UTC
Last activity: never
Total entries: 0 active, 0 staged, 0 superseded

## Current state
No state entry recorded. Use `priors stage --kind state` to add one.

## Active decisions
(none yet — `priors stage --kind decision` to add)

## Active constraints
(none yet)

## Open questions
(none yet)

## Contested or under review
(none)

## Recently superseded (last 14 days)
(none)

## Known dead ends
(none yet)

## Suggested next moves
- Stage a state entry describing what this project is currently working on.

## How to fetch more
- Full entry:    priors://entry/{id}
- Evidence:      priors://audit/{id}
- Chronology:    priors://log
- Search:        recall(query, filters)
```

### Populated store (excerpted; total ~1400 tokens)

```markdown
# Project trajectory brief
Project: priors-vnext (id: prj-7f3a-de4b)
Generated: 2026-04-26 14:32 UTC
Last activity: 2 hours ago
Total entries: 23 active, 4 staged, 6 superseded

## Current state
Building the MCP server scaffold around a deterministic brief and a
staged-only distillation path. CLI is a thin wrapper over the same store.
No background daemon, no decay scoring, no emit-constraint in v1.

## Active decisions
- `pri-20260424-mcp-native` MCP is the primary surface; CLI is a wrapper (as_of 2026-04-24, confidence: h)
- `pri-20260424-local-only` Storage is local files; no cloud component in v1 (as_of 2026-04-24, confidence: h)
- `pri-20260425-deterministic-brief` Brief is mechanically assembled, never model-generated (as_of 2026-04-25, confidence: h)
- `pri-20260425-stage-only-hooks` Hooks may stage proposals; never auto-commit (as_of 2026-04-25, confidence: h)
- `pri-20260426-defer-emit` `emit_constraint` deferred to v2 (as_of 2026-04-26, confidence: m)

## Active constraints
- `pri-20260424-no-secrets` No secrets, credentials, or PII may be stored
- `pri-20260424-evidence-mandatory` Every staged entry must include quoted evidence
- `pri-20260424-import-dry-run` Imports default to dry-run with no overwrite
- `pri-20260425-token-bounded-brief` Brief must not exceed 2000 tokens

## Open questions
- `pri-20260426-project-identity` What is the canonical definition of a "project"? Directory? Repo? UUID? (raised 2026-04-26)
- `pri-20260426-conflict-resolution-ux` How do users resolve contested entries? CLI prompt? Edit-in-place? (raised 2026-04-26)

## Contested or under review
(none)

## Recently superseded (last 14 days)
- `pri-20260420-decay-scoring` Active decay reweighting → `pri-20260426-defer-decay` Defer decay; rely on `as_of` dates (2026-04-26)

## Known dead ends
- `pri-20260422-vector-store` Embedding-based retrieval; rejected because token-efficient retrieval works without it at expected volumes
- `pri-20260423-background-daemon` Always-on capture daemon; rejected because trust cost exceeds value at v1 scale

## Suggested next moves
- Resolve `pri-20260426-project-identity` before any export/import work lands.
- Resolve `pri-20260426-conflict-resolution-ux` before shipping `mark_stale`.

## How to fetch more
- Full entry:    priors://entry/{id}
- Evidence:      priors://audit/{id}
- Chronology:    priors://log
- Search:        recall(query, filters)
```

## Tests the brief MUST pass (regression suite)

1. **Token bound**: brief never exceeds 2000 tokens, on any input.
2. **Deterministic**: same store state produces byte-identical brief output.
3. **No body leakage**: brief contains no entry body content (`grep -F "## Reasoning"` returns nothing).
4. **Empty handling**: empty store produces a valid brief with placeholders.
5. **Date completeness**: every claim line includes a date marker.
6. **Section completeness**: all 9 sections always render, even when empty.
7. **ID validity**: every ID in the brief resolves via `get_entry(id)`.
8. **Drift tolerance**: adding a new entry only changes the brief in the section that entry belongs to (no global re-assembly side effects beyond intended).

These are the snapshot tests AGENTS.md asks for. Without them, the brief is theater.

## What this spec does not yet decide

- **The exact prose voice** of the assembled brief. The current draft is terse-imperative. A user-friendly variant might be slightly warmer. This is a polish question for after v1 lands.
- **How to expose the brief over CLI** (`priors brief` should mirror the resource exactly, but pagination for very dense Active Constraints sections is open).
- **Whether to include a one-line "weather" assessment** ("project is moving steadily" / "project is contested" / "project is stalled") at the top. This is appealing but model-generated, which violates the determinism principle. Skip for v1.
