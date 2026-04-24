# /priors:init — onboarding design

Why init looks the way it does. For anyone picking up this repo and asking "why two flows, why no preferences interview, why a hash in state.json."

## The thesis

The old init asked the user to describe themselves. It wrote `how_they_think`, `preferences`, `strengths`, `growth_edges`, and `goals_for_this_project` before any work had happened. That is a profile file, and it re-centres the agent as the persistent thing — exactly what `internal/thinking.md` says this tool refuses.

Init writes the scaffold. Entries accrue through work via `/priors:log` and Phase 2 `/priors:distill`. An empty `entries/` directory after init is correct, not incomplete.

## The two flows

`/priors:init` dispatches on repo state. The decision is purely observable:

- **Existing** — `git log --oneline --no-merges | wc -l > 5`, OR a populated `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod`, OR a `README.md` longer than 40 lines.
- **Fresh** — none of the above.
- **Ambiguous** (framework scaffold with one commit) — ask one question, commit to one flow.

**Flow A (existing codebase)** is inference-first. Four helpers under `lib/init/` (`detect-stack`, `detect-ci`, `detect-back-pressure`, `inferred-signals-hash`) read the repo once and emit KEY=VALUE lines. The command composes a single consolidated review — no question stream — and lets the user edit, accept, or skip per line. Two questions at the bottom cover what the repo cannot tell: hard constraints not in CI, dead-ends already learned. Nothing more.

**Flow B (fresh repo)** is three project-shape questions. No operator psychology. The questions are:

1. In one or two sentences, what are you building?
2. What would "this is working" look like for the next unit of work?
3. Is there any constraint you already know must hold regardless of what you're building?

Only Q3 may seed an entry, and only if the answer has a back-pressure target (a lint rule, hook, or CI gate to point at). "I want terse responses" stays out — no enforcement mechanism.

## The bracket-tag provenance system

Every bullet in `HEAD.md` carries a `[source]` tag. The tag carries the epistemic weight; the prose does not editorialize.

| Tag | Meaning | Writable by |
|---|---|---|
| `[package.json]`, `[tsconfig.json]`, `[lockfile]` | Directly observed. | Flow A helpers. |
| `[git]` | From `git` commands; no names captured. | Flow A. |
| `[detected: <path>]` | From `detect-back-pressure.sh`; includes the enforcement point. | Flow A. |
| `[inferred: <basis>]` | Interpretive, confirmed by the operator. Never promotes to constraint. | Flow A, after confirmation. |
| `[volunteered]` | Operator's own words. | Both flows. |
| `[confirmed]` | Operator confirmed an inferred read. | Flow A. |
| `[conflict: A says X, B says Y]` | Sources disagree. Unresolved, not merged. | Flow A. |

"I see you're using Next.js" is weaker than `[package.json] Next.js 15.2`. The former is Claude pretending to observe; the latter is a literal citation.

## Hard caps

All caps are checked at write time. If exceeded, the command asks the user whether to trim or abort — never silently truncates.

| Artifact | Cap |
|---|---|
| Total `/priors:init` end-to-end tokens | 10,000 |
| `HEAD.md` | 60 lines, 2KB |
| `operator.yaml` | 1KB |
| `state.json` | 512B |
| `index.json` (initial) | 512B |
| `contradictions.json` (initial) | 128B |
| Questions — Flow A | ≤2 |
| Questions — Flow B | exactly 3 |
| Seed entries — Flow A | 0 |
| Seed entries — Flow B | 0–1 |

When `HEAD.md` would exceed the line cap, drop lowest-value items first: interpretive before observable. Do not truncate mid-bullet.

## operator.yaml shape

Only three fields written at init: `as_of`, `role_in_project` (if volunteered), `known_back_pressure_targets[]`. Optional `notes[]` of verbatim user quotes with `as_of` and `from:` provenance.

Fields *permitted but never populated at init*: `how_they_think`, `preferences`, `strengths`, `growth_edges`, `goals_for_this_project`, `epistemic_note`. These fields land only if the user explicitly edits them in later, or if Phase 2 `/priors:distill` proposes them from observed sessions with a `source.session` ID and a `valid_through` horizon.

Reason for the separation: paraphrased attribute arrays under an appended `epistemic_note` disclaimer do not actually enforce as-of framing at retrieval time. The AI Index 2026 documented that false-user-belief framing collapses model accuracy (DeepSeek R1 90%+ → 14.4%). A `notes[]` entry with a direct quote and a date is citeable and falsifiable; a `preferences[]` array with "Terse responses" reads as present-tense user belief the moment it hits a retrieval prompt.

## Monorepo handling

Flow A detects a workspace file (`pnpm-workspace.yaml`, `turbo.json`, `nx.json`, root `package.json` with `workspaces`) via `detect-stack.sh`. On a hit, `HEAD.md` gets one bullet naming the workspace type and member count; `state.json` is unchanged. Per-package `HEAD.md` is a Phase 2 extension and explicitly out of scope for init — the root store is the coordination point.

## External agent files

If `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, or `.github/copilot-instructions.md` exist, Flow A adds an "External agent files" section to `HEAD.md` listing each by path with `[detected]`. Contents are never read into the priors store and never merged. If an external file contradicts an inferred fact (e.g., `CLAUDE.md` says "Next.js 14", `package.json` says 15.2), the contradiction is recorded as a single bullet tagged `[conflict: CLAUDE.md says X, package.json says Y]`. Resolution is deferred to the user.

## The `inferred_signals_hash` in state.json

SHA256 of canonical inference inputs — `package.json`, `tsconfig.json`, lockfile identity, CI workflow contents, committer count. Produced at init by `lib/init/inferred-signals-hash.sh`. Costs ~64 bytes.

The hash exists so that a future `/priors:reconcile` (Phase 2 stub at `commands/reconcile.md`) can re-run inference, diff against the stored hash, and surface drift as candidate `contradiction` entries when the repo has moved past what `HEAD.md` claims. Without this, `HEAD.md` silently decays between month 1 and month 6 — the same failure mode the operator profile removal was designed to prevent.

## Reconcile as Phase 1.5, not just a TODO

The stub at `commands/reconcile.md` exists deliberately. Shipping `inferred_signals_hash` without any command to read it leaves an orphaned primitive that later contributors won't know is load-bearing. The stub documents the contract even though implementation waits on Phase 2's curation layer (contradictions as first-class entries; distill as the verification surface). The interim guidance — "edit HEAD.md directly if you suspect drift" — is honest about the gap.

## What init deliberately does NOT do

- Does not read the codebase body. No `src/` walk, no dependency graph, no file ranking. Those are `/priors:distill` concerns.
- Does not write to the repo working tree. Everything lives under `~/.claude/projects/<slug>/priors/`.
- Does not commit anything to git.
- Does not touch `CLAUDE.md` or any other agent-facing file in the repo.
- Does not affirm operator answers. "OK, recording." is fine. "Great" / "makes sense" is not — it inflates Claude's confidence in its own paraphrase.
- Does not fish. If the user says "no" or stays silent on Q3, the answer is "no".
