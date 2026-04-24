---
description: Bootstrap the priors store — dispatches on repo state, writes a deliberately sparse scaffold. Zero seed entries by default; operator.yaml carries no timeless user-belief attributes.
---

# /priors:init

First end-to-end surface. Scaffolds the priors store as a handoff artifact, not a self-description of the user. Two flows: one for an existing codebase (inference-first, interview-last), one for a fresh repo (three project-shape questions, no operator psychology). Both produce the same file set.

## Read this first — what this command refuses to do

- Does not ask about role, preferences, thinking style, strengths, growth edges, goals, or past AI frustrations. If the user volunteers any of these, record them as a direct quote inside an `as_of`-tagged note — never paraphrased into an attribute.
- Does not affirm operator answers before recording ("OK, recording that." ✓ / "That sounds good." ✗).
- Does not present inference as discovery (`[package.json] Next.js 15.2` ✓ / "I see you're using Next.js" ✗).
- Does not seed entries in Flow A. `entries/` is empty after init — entries accrue via real work, not via interrogation at init time.
- Does not write any field containing the words "prefers", "likes", "thinks", "believes", "values", "style", "approach to", "philosophy" unless the user's own words are preserved verbatim in an `as_of`-tagged note.

## Store location

```bash
slug="$(pwd | sed 's|/|-|g')"
store="$HOME/.claude/projects/$slug/priors"
```

Resolve once, reuse. Use `Bash` to compute; use `Read`/`Write`/`Edit` against the absolute path. Do not hardcode the slug.

## Preflight

Before writing anything:

1. `ls "$store" 2>/dev/null`. If `$store/HEAD.md` exists, ask: overwrite or abort? Default to abort.
2. If the directory doesn't exist, proceed.
3. `TZ=Australia/Perth date -Iseconds` → `now`. `TZ=Australia/Perth date +%Y-%m-%d` → `today`. Do not guess timestamps.

## Step 1 — Dispatch: existing vs fresh

Run these three checks via `Bash` and classify:

```bash
# A — non-merge commits
commits=$(git log --oneline --no-merges 2>/dev/null | wc -l | tr -d ' ')

# B — package/build file with non-scaffold content
#     (any of package.json, pyproject.toml, Cargo.toml, go.mod)
has_pkg=0
for f in package.json pyproject.toml Cargo.toml go.mod; do
  [[ -f "$f" ]] && has_pkg=1 && break
done

# C — README length
readme_lines=$(wc -l < README.md 2>/dev/null | tr -d ' ' || echo 0)
```

Classification:

- **Existing** (Flow A): `commits > 5` OR `has_pkg=1` with non-scaffold markers OR `readme_lines > 40`.
- **Fresh** (Flow B): none of the above.
- **Ambiguous** (e.g., `create-next-app` scaffold, 1 initial commit): ask exactly one disambiguating question, then commit to one flow:

  > "This repo has a framework scaffold but no other commits yet. Treat it as existing work with context to inherit, or as a fresh start?"

  Accept `existing` / `fresh`. Do not follow up. Do not offer a third option.

## Step 2 — Flow A: existing codebase

Goal: write `HEAD.md`, `operator.yaml`, `state.json`, empty `index.json`, empty `contradictions.json`. Zero seed entries.

### 2.1 Inference pass — run all four helpers

Via `Bash`, from the repo root:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/lib/init/detect-stack.sh"
bash "${CLAUDE_PLUGIN_ROOT}/lib/init/detect-ci.sh"
bash "${CLAUDE_PLUGIN_ROOT}/lib/init/detect-back-pressure.sh"
bash "${CLAUDE_PLUGIN_ROOT}/lib/init/inferred-signals-hash.sh"
```

Also gather (bounded — do not read every file):

- `git log --pretty=format:'%h %ad %s' --stat -n 50 --date=short` — trajectory shape.
- `git log --pretty=format:'%an' --no-merges | sort -u | wc -l` — committer count as a number. Do not capture names.
- `README.md` — first 150 lines only.
- Root-only directory tree, depth 2: `find . -maxdepth 2 -type d -not -path '*/node_modules*' -not -path '*/.next*' -not -path '*/.git*' -not -path '*/dist*' -not -path '*/build*' -not -path '*/.turbo*' | sort`.
- Existing agent-facing files — record presence, do **not** overwrite: `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`.

Hold everything in memory. Do **not** scan the codebase body. Do **not** build a dependency graph. Do **not** rank files. Those are Phase 2 distill concerns.

### 2.2 Classify each candidate fact

Three bins. Default to the more conservative bin on any doubt.

| Bin | Rule | Example |
|---|---|---|
| **Auto-apply** | Directly observable from a single signal, unambiguous. | `stack=Next.js 15.2` from `detect-stack.sh`. |
| **Present for confirmation** | Observable but interpretive. | "pre-launch" stage inferred from commit cadence + no version tag + no production deploy config. |
| **Ask explicitly** | Not inferable from the repo. | Hard constraints not encoded in CI/lint; dead-ends the operator has already learned. |

An interpretive inference never becomes a `constraint` entry at init — constraint requires a back-pressure target, and Flow A writes zero entries. Interpretive facts land in `HEAD.md` bullets tagged `[inferred]`, nothing more.

### 2.3 Presentation — single consolidated review

Emit exactly this shape in one message. Do not stream questions one at a time. Do not editorialize. Do not use "great", "makes sense", or similar before recording anything.

```
Inferred from repo (I will apply these unless you edit):
  [package.json]   stack: Next.js 15.2 + TypeScript 5.4 + Tailwind v4
  [lockfile]       package manager: pnpm
  [git-log]        ~4 non-merge commits/week, 1 committer, active dev
  [tsconfig]       strict mode: on
  [.github]        CI: test on PR via Vitest; no e2e gate

Needs your confirmation (my read — correct or edit):
  stage: pre-launch (no version tag, no production deploy config)
  "shipping well": CI green + manual smoke test

Unable to determine from the repo (omitted):
  deploy target: no vercel.json / netlify.toml / Dockerfile at root

Questions (only what the repo cannot tell me):
  1. Is there a hard constraint you're already working under that isn't in CI?
  2. Anything you've tried that didn't work, that you want on the record?
```

Accept `y`, inline edit, or `skip` per line. On `skip`, drop the item — do not follow up. The "Unable to determine" block is not interactive; it is a record of absence. Absence is evidence.

### 2.4 Apply edits, then write the file set

Write via `Write`. Paths all under `$store/`.

**`HEAD.md`** — sectioned bullets only, every bullet `[source]`-tagged. Hard cap: 60 lines, 2KB. If you would exceed, drop the lowest-value items first: interpretive before observable. Do not truncate mid-bullet.

```markdown
# Priors — <project name from basename of cwd>

_as of <today>_

## Project

- <project description>  [volunteered]
- <basename of cwd> / default branch `<branch>`  [git]
- <workspace_members> workspace members  [pnpm-workspace]  ← only if monorepo

## Stack

- <stack + version>  [<stack_source>]
- <package manager>  [<package_manager_source>]
- TypeScript strict: <on|off>  [tsconfig.json]
- Node <version>  [<node_version_source>]

## Stage

- <stage descriptor>  [inferred: <basis>]
- Shipping signal: <what "working" means>  [confirmed]

## Hard constraints

- <user-stated constraint>  [volunteered]
- <back-pressure target summary, e.g., pre-commit hook at .husky/pre-commit>  [detected]
- — or —
- None recorded  [absence is data, not a gap]

## Open questions

- <user-flagged deferral>  [volunteered]
- — or —
- None

## External agent files (not authored by priors)

- CLAUDE.md present — leave alone  [detected]
- AGENTS.md present — leave alone  [detected]
- — omit this section entirely if none detected —
```

If an external agent file contradicts inference (e.g., CLAUDE.md says "Next.js 14", `package.json` says 15.2), add a single line under the External section: `[conflict: CLAUDE.md says X, package.json says Y — unresolved]`. Do not merge. Do not rewrite.

**`operator.yaml`** — hard cap 1KB. Only these fields:

```yaml
as_of: <today>
role_in_project: <value if volunteered, else omit this key entirely>
known_back_pressure_targets:
  - path: <path>
    type: <hook|lint|format|typecheck|ci>
  # one entry per line emitted by detect-back-pressure.sh
notes:
  # empty array unless the user volunteered free-text context.
  # Each note is a direct quote, as_of-tagged. Never paraphrased.
  - as_of: <today>
    quote: "<exact words>"
    from: <ambiguity-disambiguation|q1-hard-constraints|q2-dead-ends>
```

Do **not** write `how_they_think`, `preferences`, `strengths`, `growth_edges`, `goals_for_this_project`. Those are Phase 2 distill targets or they stay out.

If a user answer to Q1 or Q2 is "no" / "nothing" / silence — record nothing. Do not fish.

**`state.json`** — hard cap 512 bytes.

```json
{
  "schema_version": 1,
  "flow": "existing",
  "initialised_at": "<now>",
  "active_branch": "<git rev-parse --abbrev-ref HEAD>",
  "last_known_good_commit": "<git rev-parse HEAD>",
  "inferred_signals_hash": "sha256-<from helper>",
  "open_prs": [],
  "known_broken": []
}
```

The `inferred_signals_hash` is load-bearing — it is the drift-detection primitive a future `/priors:reconcile` will read. Phase 2. Do not omit.

**`index.json`** — hard cap 512 bytes initially.

```json
{
  "updated": "<now>",
  "entries": [],
  "tags": {},
  "types": {}
}
```

**`contradictions.json`** — hard cap 128 bytes initially.

```json
{
  "updated": "<now>",
  "contradictions": []
}
```

**`entries/_schema.yaml`** — copy from `${CLAUDE_PLUGIN_ROOT}/skills/priors/schemas/_base.yaml`. Reference only; not validated at runtime in Phase 1.

**Placeholders** — `entries/.keep`, `compiled/.keep`, `archive/.keep`.

## Step 3 — Flow B: fresh repo

Goal: same file set, deliberately sparser. No inference; nothing to infer. Three project-shape questions, one at a time. Do not interrogate.

### 3.1 Question design

- Open-ended. No "is this a SaaS app / internal tool / …" framings.
- Do not offer examples or categories before the answer.
- One question per turn.
- After each answer, paraphrase the minimum structured reading and ask only "Is that accurate?" — not "Did I get that right?" or "Does that sound good?"
- If the answer is vague, at most one follow-up, then move on.
- No affirmation before recording. "OK, recording." is acceptable. "Great" / "makes sense" is not.

### 3.2 The three questions, in order

1. **In one or two sentences, what are you building?**
2. **What would "this is working" look like for the next unit of work?**
   If asked to clarify: "The smallest observable signal a change is good — tests pass, a user does X, a metric moves. Pick what's real for this project."
3. **Is there any constraint you already know must hold regardless of what you're building?**
   "No" is a valid answer. Do not fish.

Q3 is the only one that may seed an entry, and only if (a) the user stated a concrete rule and (b) there is a back-pressure target to point at ("I have a pre-commit hook that blocks X" ✓; "I want terse responses" ✗ — no enforcement mechanism, stays out).

### 3.3 Writes for Flow B

Same files as Flow A. Differences:

- `HEAD.md` — no `[source]` tags (no inference happened). Use `[volunteered]` or leave untagged. ~30–40 lines, not 60.
- `state.json` — `"flow": "fresh"`. `inferred_signals_hash` still computed from the helper (will capture "empty repo" state; useful for future drift).
- `operator.yaml` — same minimum shape. `known_back_pressure_targets: []`.
- `entries/` — 0 entries unless Q3 produced a qualifying rule, in which case 1 `constraint` entry with the back-pressure target filled in. Never 2+.

## Step 4 — Confirm and next steps

Print `$store` so the user knows where it lives. Tell them:

- Run `/priors:log` when the next loggable moment happens (correction, decision, dead-end).
- Run `/priors:recall <tag>` once entries exist.
- `/priors:auto-on` registers the ambient operator injection — off by default, ~200 tokens/prompt when on.
- A future `/priors:reconcile` will re-run inference and surface drift; `inferred_signals_hash` in `state.json` is the primitive it reads.

## Hard caps (do not violate)

- Total `/priors:init` end-to-end token budget: **≤10,000**. If you are on track to exceed, stop and ask the user whether to trim or abort. Do not silently truncate.
- File sizes: `HEAD.md` ≤2KB, `operator.yaml` ≤1KB, `state.json` ≤512B, `index.json` ≤512B initially, `contradictions.json` ≤128B initially.
- Seed entries: **0 for Flow A**; **0–1 for Flow B** (only if Q3 answer has a back-pressure target). Never 2+.
- Questions: **≤2 for Flow A** (the two in §2.3). **Exactly 3 for Flow B.**

## Anti-sycophancy guards

- Paraphrase any operator-quote content and require an explicit `yes` before writing. Silence or "sure" counts as decline.
- Record absences. "Unable to determine deploy target — omitted" is better than quietly not mentioning it.
- The `[source]` bracket tag carries the epistemic weight. Prose does not editorialize.
- Do not call fields like `how_they_think` "useful context"; they are off-product. If the user asks why you didn't ask about their preferences, say: "Operator attributes emerge from actual work via `/priors:distill` in Phase 2 as `as_of`-tagged observations — not pre-declared at init."

## What this command does NOT do

- Does not write to the repo working tree. Everything lives under `$store/`.
- Does not touch `CLAUDE.md`, `AGENTS.md`, or any other agent-facing file in the repo. Flags their presence in `HEAD.md`, leaves them alone.
- Does not register hooks. Plugin hooks are registered via `hooks/hooks.json`; `UserPromptSubmit` is gated by the `$store/.auto-on` flag, not by this command.
- Does not commit anything to git.
- Does not call `memory.view` or write to `/memories/…` — that SDK path is a regression, not the current architecture.

## Error handling

- If `mkdir` or any `Write` fails, report which files succeeded and which didn't. Do not auto-retry silently. Do not continue past an error.
- If `${CLAUDE_PLUGIN_ROOT}` is unset, tell the user the plugin isn't loaded correctly and abort. Do not guess the path.
- If `git` is not available, `active_branch` / `last_known_good_commit` / committer count stay `null`. `inferred_signals_hash` still computes (without the committer line).
