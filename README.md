# priors

> A project's trajectory becomes legible to future agents as causality, not as retrieval.

priors is a typed, project-scoped dataset of the decisions, corrections, constraints, dead-ends, and patterns that accrue across coding sessions. Directory-backed, tool-agnostic, zero ambient per-prompt cost. Future agents inherit the project's shape without being told.

## The inversion

Most agent-memory work treats the agent as protagonist and memory as infrastructure the agent uses. priors inverts that. The project's trajectory is primary. Agents are transient participants. Sediment persists; agents come and go against it.

Agent-primary tools optimise for a smarter, more capable agent. Trajectory-primary tools optimise for the project developing legible shape, a stance future agents inherit without being told. Different products, different features.

## What it fixes

Three gaps run through the research (ACE, ReasoningBank, Anthropic's harness-design-for-long-running-apps piece, humanlayer's CLAUDE.md critique). priors closes all three.

**Untyped free-text loses causality.** "We chose X" records the outcome and loses the structure. Six months later you can't ask what else was considered or when we'd revisit. priors ships typed entries (`correction`, `decision`, `dead-end`, `pattern`, `constraint`, `open-question`) plus a rolling `operator.yaml` for the person-in-project context. Each type carries its own schema. You can ask what was decided, what was rejected, under what conditions we'd revisit.

**Contradictions silently overwrite.** Most stores append or overwrite when a new learning conflicts with an old one. The disagreement is the signal. priors keeps both entries and emits the contradiction as a first-class record with a supersede / coexist / revert resolution. `supersedes` and `superseded_by` form a bidirectional graph. Old layers keep their shape after they stop being current.

**Notes don't produce back-pressure.** A rule in a notes file depends on the agent remembering to read and obey it. The lessons that compound are the ones the environment refuses to let you violate. Promoting an entry to `constraint` requires an enforcement target: a pre-tool-use hook, system-reminder injection, lint rule, or evaluator criterion. Descriptive-only entries stay at `note` and decay.

## The store

```
/memories/priors/
  HEAD.md              cold-start orientation
  operator.yaml        who's working on this project, as of when
  state.json           live pointers: branch, active feature, open PRs
  index.json           machine index of active entries
  contradictions.json  first-class disagreement records
  entries/             typed YAML, date-prefixed, one file per entry
  compiled/            regenerated human view + hook reminders
  archive/             retired entries
```

Directory-backed. Portable, git-friendly, grep-friendly, diff-friendly. Open the directory and understand the project in under a minute without running the tool.

The format is the contract. Any agent that speaks `memory_20250818`-compatible file I/O and respects the typed entries shares the same sediment. Coordination-free multi-agent, because the format carries the coordination.

## How it works

**Capture.** `/priors-log` writes one typed entry. `/priors-distill` runs a sub-agent over the session transcript and proposes entries as a reviewable diff. Nothing auto-writes.

**Curate.** `/priors-promote` moves an entry up the tier ladder: `raw` → `structured` → `constraint`. Promotion to `constraint` passes the back-pressure gate. `/priors-contradict` records a disagreement between two entries and prompts for a supersede / coexist / revert stance. Helpful and contradicted counters accumulate as entries get cited or disputed, and feed the compile step's ranking.

**Compile.** `/priors-compile` regenerates two files from the typed store, deterministically. `compiled/harness-reminders.md` hook-injects at cold-start, under 500 tokens. `compiled/narrative.md` reads as a project autobiography structured temporal, causal, and thematic. Diff-reviewable. Never auto-applied.

**Enforce.** `/priors-enforce-on` wires two hooks. `PreToolUse` warns or blocks on matching Edit and Write calls. `UserPromptSubmit` injects topical reminders on matched prompts. Lint rules and evaluator criteria emit as diffs for external consumption. Off by default.

**Share.** `/priors-export` writes the store to any directory. `FORMAT.md` specifies the schema, versioning, and lifecycle operations. A conformance suite verifies a new implementation.

## Install

Copy `.claude/` into a project. Run:

    /priors-init

priors interviews you briefly for operator context, writes `HEAD.md`, and bootstraps the store. Every fresh Claude Code session in the project cold-starts from the priors automatically. No CLAUDE.md bloat. No ambient per-prompt tokens.

## Commands

| Command | What it does |
| --- | --- |
| `/priors-init` | Bootstrap the store, interview for operator context |
| `/priors-log` | Write one typed entry |
| `/priors-distill` | Sub-agent proposes entries from the session transcript |
| `/priors-recall <query>` | Search by tag, type, substring, or file path |
| `/priors-promote <id> --to <tier>` | Move an entry up or down the tier ladder |
| `/priors-contradict <new> <old>` | Record a disagreement with a resolution stance |
| `/priors-compile` | Regenerate `narrative.md` and `harness-reminders.md` |
| `/priors-emit <id>` | Emit a constraint's enforcement artifact |
| `/priors-export <path>` | Write the store to an external directory |
| `/priors-state` | Refresh `state.json` from the working tree |
| `/priors-index` | Regenerate `index.json` |
| `/priors-matcher-test <id>` | Dry-run a constraint's matcher against a synthetic tool call |
| `/priors-auto-on` | Enable per-prompt operator injection |
| `/priors-enforce-on` | Wire `PreToolUse` + system-reminder enforcement |

Every opt-in has a matching opt-out.

## Token budget

Zero ambient per-prompt cost by default. The `SessionStart` hook fires once per session and loads three small files. Distill, promote, compile, and export run user-invoked. Operator injection and enforcement are explicit opt-ins that document their cost at the point of opting in. Any always-on surface either fits inside the cold-start budget or ships off by default.

## Commitments

- The machine store is canonical. The human-readable narrative regenerates from entries, never hand-authored.
- Contradictions are never silent overwrites. Both entries preserved. The disagreement is queryable.
- Constraints require back-pressure targets. A rule the agent can ignore is not a rule.
- Entries carry `valid_from` and `valid_through`. Retrieval treats them as "as-of" records. The AI Index 2026 finding on belief-vs-fact vulnerability (DeepSeek R1 dropping from 90%+ to 14.4% accuracy on false-user-belief framing) is a design constraint.
- No model-specific coupling. Claude Code is the reference implementation. The format stands on its own.
- No auto-generated CLAUDE.md. humanlayer documented that class of bloat as a performance regression.
- No vector / embedding retrieval. Retrieval-by-similarity is what ACE and ReasoningBank improved over. Going back is a regression dressed up as sophistication.

## Lineage

Reflexion (2023) → Dynamic Cheatsheet (Apr 2025) → ACE (Oct 2025) → ReasoningBank (NeurIPS 2026).

Three convictions run through this research:

1. Compression loses signal you can't predict at capture time. Preserve detail, filter at read time. (ACE)
2. Failures teach better than successes. Most systems don't capture them. (ReasoningBank)
3. Curation is the product. Storage and retrieval are commodities. What to keep, what to promote, what to decay is where differentiation lives.

Closest precedents: claude-mem captures episodes, emits no harness artifacts. Karpathy's LLM Wiki compiles knowledge, stays read-only, doesn't modify the environment. Anthropic's `/team-onboarding` is user-scoped, not decision-scoped. Mercury Second Brain is personal-scoped with no typed curation.

The move none of them make: emit harness artifacts from curated typed entries so the environment carries the enforcement.

## The test

A fresh Claude Code session given only a project's priors, no conversation history, predicts what the project accepts or rejects on held-out proposals. Project shape inherited.

Trajectory legibility is the measure.
