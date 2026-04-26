# AGENTS.md — Priors

Any agent entering this repo reads this file first. It is short on purpose. It points to the deeper docs rather than restating them.

If something here conflicts with `docs/project-brief.md`, the brief wins on positioning. If something conflicts with `docs/specs/brief-resource.md` or `docs/specs/staged-distillation.md`, the spec wins on the surface it covers.

---

## What this project is

Priors is the project's record of itself. Decisions, dead ends, constraints, and open questions live as structured markdown entries in `.priors/`. An MCP server exposes a deterministic orientation brief and a small set of read/write tools. A CLI mirrors the MCP surface. Distillation produces staged candidates that the user must approve before they enter the active store.

The persistent subject is the project. Not the user. Not the AI. If the code you are about to write treats the user as the subject (storing user preferences, building a user profile, generating user-shaped retrieval), stop. You have drifted out of category.

The single useful question to ask at any decision point: _is the subject of what I am about to build the project, the user, or the AI?_ If the project, you are aligned. If the user or the AI, stop.

---

## Read in this order

Each is short. Read all three before touching code.

1. `docs/project-brief.md` — what Priors is and is not. Section "Why this is a different category" is the framing test. Section "Future considerations" is where you push features that try to creep into v1.
2. `docs/specs/brief-resource.md` — the locked spec for `priors://brief`. Ranking and edge-case rules are non-negotiable.
3. `docs/specs/staged-distillation.md` — the locked spec for `stage_learning`. The quote-or-refuse rule is enforced in code, not in the prompt.

After reading, if you are about to make non-trivial changes, write a one-paragraph summary of what you understand the project to be. If your summary describes Priors as "a memory system" or "an AI memory tool," go back and re-read the brief. The framing is the test.

---

## Non-negotiables

These cannot be relaxed. Every one of them traces to a specific risk identified in the brief or the specs.

### 1. The subject is the project

Not the user, not the AI. No `user.json`. No user preference entries. No identity claims. No psychology. These belong to consumer memory products. Storing "user prefers X" is the exact pattern that produces the GPT-4o belief-vs-fact failure mode (98% accuracy collapses to 64% when facts are reframed as user beliefs). Priors entries are dated, sourced, and project-scoped: "as of April 12, the team chose X because of constraint Y, evidence in commit abc."

### 2. Curation is the product

Storage is cheap. Retrieval is mostly solved. The hard product question is what to keep, what to promote, what to let decay, and what to contradict. For every memory feature, define explicitly: unit, capture trigger, admission criteria, update behavior, decay behavior, conflict behavior, deletion behavior, evidence requirement, user review surface. Do not build a junk drawer and call it memory.

### 3. Progressive disclosure over context dumping

Never load everything just because it is available. The retrieval order is:

```
brief → search/index → timeline/context → full entry/source → audit trail
```

The brief gives IDs and one-line summaries, never full bodies. Agents pull deeper only when they need to.

### 4. Quote, or refuse

Every claim staged by `stage_learning` must be supported by a verbatim quote from the source content. The verification step is mandatory and is implemented in code as a substring check, not as a prompt instruction. If the model cannot quote support, the candidate is rejected and logged to `audit/distillation-rejects.log`. No exceptions.

### 5. Stage, never commit

Distillation only writes to `staged/`. The user is the only path from `staged/` to active entries, via `commit_learning`. Hooks may stage. Hooks may not commit. There is no auto-commit anywhere, ever.

### 6. The brief is deterministic

`priors://brief` is assembled, not generated. No LLM call inside the assembler. Two runs against the same store produce byte-identical output. Tests enforce this. The brief is bounded by a token ceiling (per `docs/specs/brief-resource.md`) and truncates per section, never globally.

### 7. ID is canonical, path is incidental

Every entry has a UUID. Resolve all references through the index, never through the file path. Project identity is the UUID in `.priors/project.json`, not the directory name. Tests verify identity survives directory rename.

### 8. Local-first, file-based

The `.priors/` directory is the canonical store. Markdown with YAML frontmatter for entries. JSON for indexes and audit logs. No database. No vector store. No embeddings. No daemon. No cloud sync. No account model. The store should open in any text editor and be obvious.

### 9. Idempotency keys on every write

Every MCP write tool accepts a `client_request_id`. Agents retry. Networks fail. Without idempotency, you get duplicate entries. This is small until it is not.

### 10. Failures are first-class

Failed approaches often carry the highest-value information for future agents. Log: failed approach, symptoms, root cause if known, misleading signals, eventual correction, and whether the failure should become a test, linter, policy, or memory entry. The `recall(filter: rejected)` ritual depends on this discipline.

---

## Where things live

```
.priors/
  project.json          # UUID, name, created_at
  entries/              # active entries, by kind
    decisions/
    failures/
    constraints/
    patterns/
    questions/
    hypotheses/
  staged/               # candidates awaiting user approval
  indexes/
    all.json            # {id, kind, claim, status, confidence, as_of, updated_at}
  audit/
    actions.log         # JSONL: every write, with timestamp and source
    distillation-rejects.log
  exports/              # generated by `priors export`
  brief.md              # generated by `priors brief`
  log.md                # chronological state
```

Source layout (this repo):

```
src/
  store/                # entry read/write, index generation
  brief/                # deterministic assembly per docs/specs/brief-resource.md
  distill/              # stage_learning per docs/specs/staged-distillation.md
  mcp/                  # MCP server, resource and tool handlers
  cli/                  # priors CLI, mirrors MCP surface
  schema/               # entry schema, MCP input/output schemas
  util/                 # shared helpers (uuid, yaml, tokens)
tests/
  unit/                 # per-module unit tests
  regression/           # the seven AGENTS.md eval tasks
  fixtures/             # sample stores, transcripts
docs/
  project-brief.md
  specs/
    brief-resource.md
    staged-distillation.md
  integrations.md       # MCP client config snippets
  evals.md              # how the regression suite works
  github-workflow.md
```

---

## The MCP surface

Three resources, six tools. Names and shapes are stable across v1.

### Resources

- `priors://brief` — bounded orientation document. IDs and one-line summaries only.
- `priors://index` — full index in JSON.
- `priors://entry/{id}` — full entry body and metadata. Resolves through index, not path.

### Tools

- `recall(query, filters)` — plain text search over the index. Filters: `kind`, `status`, `confidence`, date ranges, link relations. No embeddings in v1.
- `get_entry(id)` — full entry body plus metadata.
- `stage_learning(source_kind, source_ref, source_content, project_id, candidates?, existing_entries?, prompt_context?)` — verifies up to 5 candidate lessons against the source via verbatim substring matching, writes verified candidates to `staged/`, logs rejects to `audit/distillation-rejects.log`. If `candidates` is omitted, returns the conservative-archivist system prompt rendered with the source so the calling agent can produce candidates and call back.
- `commit_learning(staged_id)` — promotes a staged entry to active. Updates indexes. Writes audit record.
- `mark_stale(id, reason)` — soft state, distinct from `superseded`. Surfaces in `recall(status: stale)`.
- `link_entries(source_id, relation, target_id)` — relations: `supersedes`, `contradicts`, `reinforces`, `derived_from`. Rejects self-links and `supersedes` cycles. A `contradicts` link sets both entries to `contested`.

Every tool input and output has a concrete JSON schema with `examples`. `additionalProperties: false` on every object schema. Every write tool accepts a `client_request_id` for idempotency.

### CLI

The CLI mirrors the MCP surface one-to-one: `priors brief`, `priors recall`, `priors stage`, `priors commit`, `priors mark-stale`, `priors link`, `priors export`, `priors import`, `priors health`, `priors evals`. The CLI and MCP server both call into the same store/logic. Whatever you change in one, change in the other.

---

## What is in v1, what is out

The full list is in `docs/project-brief.md`. The short version:

**In:** local store, MCP server, CLI, deterministic brief, conservative staged distillation, export/import with `--dry-run` default, setup docs for at least three MCP clients, the seven-task regression suite.

**Out, deferred to v2 or later:** decay scoring, helpful/harmful counters, auto-distillation hooks, `emit_constraint`, multi-project / team-shared store, web UI, vector store, cloud sync, background daemons.

If a feature is not on the in-list, it is out. Add it to `staged/feature-requests/` rather than building it.

---

## What never to do

These are failure modes that would damage v1. Each comes from a specific risk identified in the brief or the specs.

1. Do not auto-commit anything to `entries/`. Every active entry comes from an explicit user action.
2. Do not store user preferences, identity, or psychology. Re-categorizing the product is worse than shipping late.
3. Do not generate the brief with a model. Assembly is deterministic. If the brief feels boring, that is correct.
4. Do not add a vector store, embedding-based search, or semantic ranking in v1.
5. Do not let `emit_constraint` slip into v1, even as a stub.
6. Do not add a daemon or any background process.
7. Do not let staged entries pile up silently. If more than 20 staged entries are over 30 days old, `priors brief` mentions it. If more than 50, the CLI suggests `priors review-staged`.
8. Do not break determinism in the brief or the index. Two runs against the same store must produce identical output. Tests enforce this.
9. Do not use `additionalProperties: true` on any MCP schema.
10. Do not add a "fast path" through verification in `stage_learning`. Every staged candidate pays the verification cost.
11. Do not rename "prior" to "memory" in user-facing copy. Vocabulary is locked per `docs/project-brief.md`.
12. Do not market in error messages. Errors describe the failure, not the product.

---

## How to extend after v1

Priors uses Priors. As you make decisions during implementation and after, stage them. The project's own `.priors/` should be a working example of what Priors looks like in use.

- When you choose between two implementations, stage the decision with both options and the reasoning.
- When you hit a dead end, stage it as a `failure` entry with symptoms and what you tried.
- When you discover a constraint that must hold (e.g., "the brief must respond in under 300ms"), stage it as a `constraint`.
- When a question depends on user input, stage it as a `question` and move on.
- When you want to add a feature that is not in v1 scope, stage it under `staged/feature-requests/` with a one-line rationale and a link to the relevant section of `docs/project-brief.md`. Do not build it.

When something genuinely needs a spec change, do not edit the existing spec. Add a new spec doc (`docs/specs/<surface>-v2.md` or similar), link it via `relations.supersedes` from the new entries, and surface the contradiction in the brief. Conflict is data; do not silently overwrite.

---

## Definition of done for any change

A change is done when:

1. The change advances the technical contract (per the relevant spec) or explicitly explains why a non-functional change was needed.
2. Tests run, pass, and cover the empty, normal, and adversarial cases. If a test could not be run, the reason is stated.
3. The relevant docs are updated. If behavior changed and docs did not, the change is not done.
4. A staged entry exists for any decision that affects future agents. If the change introduced a new constraint, it is staged as a `constraint`.
5. The change is summarized in the PR or commit message in three lines: what changed, why, how it was verified.
6. The seven-task regression suite still passes. If the change deliberately altered a regression, the test is updated and the rationale is in the PR.

---

## GitHub workflow defaults for this repo

- Use branch-first flow: never commit directly to `main`.
- Use Conventional Commits and keep each PR single-purpose.
- Run `npm test` before pushing and treat CI failures as merge blockers.
- Prefer tags/releases only for meaningful milestones on `main`, using semver (`vMAJOR.MINOR.PATCH`).
- For behavior changes, include tests and docs updates in the same PR.

---

## When uncertain

Do not invent. Instead:

1. Search the repository.
2. Read the relevant spec end to end.
3. Check current public docs if the claim may have changed.
4. Stage a `question` entry rather than committing a false memory.
5. Propose the smallest verification step.

Good uncertainty looks like:

```
Assumption: ...
Evidence: ...
Risk if wrong: ...
How to verify: ...
```

The single most useful question to ask at any point: _is the subject of what I am about to build the project, the user, or the AI?_ If the project, you are aligned. If the user or the AI, stop.

That question is the operating contract in one line. The rest of this file is commentary on it.
