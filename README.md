# priors

> A logbook for AI-assisted projects: decisions, dead ends, and constraints — written by your agents, curated by you, readable by whoever (or whatever) shows up next.

Priors is the project's record of itself. Decisions, corrections, constraints, dead-ends, patterns, and open questions live as structured markdown entries in `.priors/`. An MCP server exposes a deterministic orientation brief and a small set of read/write tools so a fresh agent — Claude, Cursor, Codex, or whatever ships next — can pick up the project without rediscovering the same context.

The persistent subject is the **project**, not the user and not the AI. This is the design center of gravity. See [`docs/project-brief.md`](docs/project-brief.md) for why this is a different category from "AI memory."

## What it is, and isn't

**Is**

- A typed, versioned record of *why a project moves the way it does* — including what was rejected.
- A deterministic orientation brief at `priors://brief` that tells a fresh agent what to know in under 2,000 tokens.
- A conservative distillation path that turns transcripts into staged candidates the user must approve before they enter the active store.
- A local, file-based store that lives in the repo and travels with it. Markdown + YAML + JSON. No database. No daemon. No cloud.

**Isn't**

- Not a memory tool for the AI ("what does the AI know about me").
- Not a wiki, RAG store, or vector database.
- Not an agent runtime — Priors is substrate; the runtime sits on top.
- Not a SaaS. Local-first, by design.

For positioning detail and the full "isn't this just X?" comparison, see [`docs/project-brief.md`](docs/project-brief.md#what-to-say-when-someone-asks-isnt-this-just-x).

## The headline rituals

1. **Brief the new arrival** — start of any session → `priors://brief`.
2. **Recall the dead ends** — start of a sub-task → `recall(kind: failure)` returns rejected approaches with reasons.
3. **Stage the takeaways** — end of a session → distill staged candidates, approve in 30 seconds.
4. **Show me what's contested** — `recall(status: contested)` with both sides preserved.
5. **Date the claims** — every retrieved entry carries an `as_of` field.
6. **Decide and record** — moment of decision → templated `decision` entry.
7. **Hand off the pack** — `priors export` + `priors import --dry-run`.

## Install

```bash
npx @priors/cli --version
# or, from a clone:
node bin/priors.js --version
```

Node 25+ is required (the runtime imports TypeScript directly via Node's native type stripping). Zero runtime dependencies.

## Quick start

In any project you want Priors-equipped:

```bash
# Initialize the local store (creates .priors/project.json with a UUID)
priors init

# See the (mostly empty) brief
priors brief

# Stage a decision
priors stage --kind decision --claim "Use TypeScript for v1" \
  --evidence "tsconfig.json" --as-of 2026-04-26

# Approve and commit it
priors commit <staged_id>

# Re-render the brief
priors brief
```

## MCP surface (v1)

Three resources, six tools, one prompt. Stable across v1.

**Resources**

- `priors://brief` — bounded orientation document. IDs and one-line summaries only.
- `priors://index` — full index in JSON.
- `priors://entry/{id}` — full entry body and metadata.

**Tools**

- `recall(query, filters)` — plain text search over the index.
- `get_entry(id)` — full entry body plus metadata.
- `stage_learning(...)` — verifies candidate lessons against source content via verbatim substring match; writes verified to `staged/`.
- `commit_learning(staged_id)` — promotes a staged entry to active.
- `mark_stale(id, reason)` — soft state, distinct from `superseded`.
- `link_entries(source_id, relation, target_id)` — relations: `supersedes`, `contradicts`, `reinforces`, `derived_from`.

**Prompt**

- `priors_distill` — renders the conservative-archivist system prompt for the calling agent to produce candidates.

Every tool input and output has a concrete JSON schema with `additionalProperties: false`. Every write tool accepts a `client_request_id` for idempotency.

## Cross-client setup

```bash
priors init-config --client claude   --project-root "$PWD"
priors init-config --client cursor   --project-root "$PWD"
priors init-config --client codex    --project-root "$PWD"
```

Use `--dry-run` to preview without writing. Generated configs pin the local Node executable and the local CLI path; they do not depend on `npx -y` for production use.

See [`docs/integrations.md`](docs/integrations.md) for the full per-client config snippets.

## Store layout

```text
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
  indexes/all.json      # regenerated on every write
  audit/
    actions.log         # JSONL: every write
    distillation-rejects.log
  exports/
  brief.md              # generated by `priors brief`
  log.md                # chronological state
```

Markdown with YAML frontmatter for entries. JSON for indexes and audit. The store should open in any text editor and be obvious. No database. No vector store. No embeddings.

## Entry kinds

- `decision` — a choice made between alternatives, with rationale.
- `failure` — an approach tried and abandoned, with what went wrong.
- `constraint` — a rule the project must hold (e.g., "the brief must respond in under 300ms").
- `pattern` — a recurring approach worth re-applying.
- `question` — an open issue depending on input.
- `hypothesis` — a tentative claim worth investigating.

Every entry carries `as_of`, `confidence`, `status`, and a structured set of `relations` (`supersedes`, `contradicts`, `reinforces`, `derived_from`).

## What's deliberately deferred to v2+

- Active decay scoring / helpful-harmful counters
- Auto-distillation hooks (manual `priors stage` only)
- `emit_constraint` (back-pressure to executable checks)
- Multi-project / team-shared store
- Web UI / dashboard
- Vector store / embedding-based search
- Cloud sync

For each, see [`docs/project-brief.md`](docs/project-brief.md#future-considerations) for what would be required to ship it well, where it could fall apart, and where it could be faked badly.

## Tests

```bash
make test
# or
npm test
```

The suite covers:

- Entry validation, write, index regeneration
- Deterministic brief assembly (byte-identical output from identical state)
- Brief 2,000-token ceiling enforcement and per-section budget
- `recall` filters and ordering
- `stage_learning` quote-or-refuse verification (substring match against source)
- `commit_learning` promotion and audit
- `link_entries` cycle and self-link rejection
- The seven AGENTS.md regression scenarios

## Security posture

- Path traversal rejected on resource IDs and transcript paths.
- No shell interpolation in core server logic.
- JSONL audit records for every write, distillation reject, and link change.
- Generated MCP client configs pin `process.execPath` and the local CLI path.
- See [`SECURITY.md`](SECURITY.md).

## Returning to the legacy v0.3 implementation

The pre-rejig MCP server (with `~/.priors`, decay scoring, `priors.reinforce`, `priors.emitConstraint`) is preserved at the tag `legacy/v0.3.0`:

```bash
git checkout legacy/v0.3.0
```

It is not maintained on `main` or `reval`.

## License

MIT. See [`LICENSE`](LICENSE).
