# priors

> A project's trajectory becomes legible to future agents as causality, not as retrieval.

priors is a typed, project-scoped dataset of the decisions, corrections, constraints, dead-ends, and patterns that accrue across coding sessions. Directory-backed, zero ambient per-prompt cost. Future agents inherit the project's shape without being told.

Ships as a Claude Code plugin. The store lives in your `~/.claude/projects/<slug>/priors/` (agent-side, outside your repo — `git status` stays clean). The format is plain YAML + JSON + Markdown, so cross-model adapters can consume the same store later.

Bootstraps from repo inference where possible. Interviews only what the repo can't answer, with at most three questions on a fresh project.

## The inversion

Most agent-memory work treats the agent as protagonist and memory as infrastructure the agent uses and priors inverts that. The project's trajectory is primary. Agents are transient participants. The sedimentation of the overall project trajectory persists and your agents come and go against it.

Agent-primary tools optimise for a smarter, more capable agent. Trajectory-primary tools optimise for the project developing legible shape, a stance future agents inherit without being told. Different products, different features.

## What it fixes

Three gaps run through the research.

**Untyped free-text loses causality.** "We chose X" records the outcome and loses the structure. Six months later you can't ask what else was considered or when we'd revisit. priors ships typed entries (`correction`, `decision`, `dead-end`, `pattern`, `constraint`, `open-question`), each with its own schema. You can ask what was decided, what was rejected, under what conditions we'd revisit. A companion `operator.yaml` holds the narrow slice of project-scoped operator facts that are directly observable — role in this project, known back-pressure targets, explicit hard constraints. Preferences, working-style, strengths, goals stay out of Phase 1 entirely; those are user-belief framings that break model accuracy under the belief-vs-fact vulnerability documented in AI Index 2026, and they accrue from evidence via `/priors-distill`, never from interview.

**Contradictions silently overwrite.** Most stores append or overwrite when a new learning conflicts with an old one. The disagreement is the signal. priors keeps both entries and emits the contradiction as a first-class record with a supersede / coexist / revert resolution. `supersedes` and `superseded_by` form a bidirectional graph. Old layers keep their shape after they stop being current.

**Notes don't produce back-pressure.** A rule in a notes file depends on the agent remembering to read and obey it. The lessons that compound are the ones the environment refuses to let you violate. Promoting an entry to `constraint` requires an enforcement target: a pre-tool-use hook, system-reminder injection, lint rule, or evaluator criterion. Descriptive-only entries stay at `note` and decay.

## The store

```
~/.claude/projects/<slug>/priors/
  HEAD.md              cold-start orientation — bullets with [source] tags, 60-line cap
  operator.yaml        who's working on this project, as of when
  state.json           live pointers + inferred_signals_hash (drift-detection primitive)
  index.json           machine index of active entries
  contradictions.json  first-class contradictions (Phase 2 populates)
  entries/             typed YAML, date-prefixed, one file per entry
  compiled/            regenerated human view + hook reminders (Phase 3)
  archive/             retired entries
```

Directory-backed. Portable, git-friendly, grep-friendly, diff-friendly. Open the directory and understand the project in under a minute without running the tool.

The format is the contract: plain YAML entries + JSON index + Markdown orientation. The plugin is one implementation surface; anything that can read a file can consume the same sediment.

## Install

As a Claude Code plugin:

```bash
# Local testing against a clone of this repo:
claude --plugin-dir /path/to/priors

# Once published to a marketplace:
/plugin install priors
```

Inside Claude Code, run:

```
/priors:init
```

On an existing codebase, priors reads what the repo can tell it — stack, CI, back-pressure targets (pre-commit hooks, lint configs, typecheck, CI workflows) — and presents the inferences with `[source]` tags you can accept, edit, or skip per line. Two questions cover what the repo can't tell (hard constraints not in CI, dead-ends you've already learned). No questions about preferences, thinking style, or goals; those are not capturable as timeless facts and are off-product by design.

On a fresh repo, priors asks three project-shape questions instead — what you're building, what "working" looks like, any constraint that must hold — and leaves the rest to accrue.

Either way, `entries/` starts empty. Entries land through real work via `/priors:log` and (Phase 2) `/priors:distill`, not through an interview at init time.

Every fresh Claude Code session in the project cold-starts from the priors automatically. No CLAUDE.md bloat. No ambient per-prompt tokens. Nothing added to your repo.

## Phase 1 commands

| Command                  | What it does                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `/priors:init`           | Bootstrap the store. Inference-first on an existing codebase; three project-shape questions on a fresh repo |
| `/priors:log`            | Write one typed entry (correction, decision, dead-end, pattern, open-question)                              |
| `/priors:recall <query>` | Search by tag, type, substring, or file path                                                                |
| `/priors:index`          | Regenerate `index.json` from `entries/`                                                                     |
| `/priors:state`          | Refresh `state.json` from the working tree                                                                  |
| `/priors:health`         | Audit the store for stale, low-use, contradicted, duplicate entries                                         |
| `/priors:auto-on`        | Enable per-prompt operator injection (opt-in, default off)                                                  |
| `/priors:auto-off`       | Disable per-prompt operator injection                                                                       |
| `/priors:distill`        | (Phase 2, stubbed) Sub-agent proposes entries from the session transcript                                   |
| `/priors:reconcile`      | (Phase 2, stubbed) Re-run inference, surface drift against what `HEAD.md` recorded at init                  |

Every opt-in has a matching opt-out.

## Phase 2+ (roadmap, not shipping)

- `/priors:promote <id> --to <tier>` — move an entry up or down the tier ladder
- `/priors:contradict <new> <old>` — record a disagreement with a supersede / coexist / revert stance
- `/priors:compile` — regenerate `narrative.md` and `harness-reminders.md` deterministically
- `/priors:emit <id>` — emit a constraint's enforcement artifact (pre-tool-use hook, lint rule, evaluator criterion)
- `/priors:export <path>` — write the store to an external directory
- `/priors:matcher-test <id>` — dry-run a constraint's matcher against a synthetic tool call
- `/priors:enforce-on` — wire `PreToolUse` + system-reminder enforcement

Specced in `internal/phase-2-spec.md` through `phase-5-spec.md`. Phase 1 (capture + retrieve) ships first; later phases gate on each previous phase proving value.

## Token budget

Zero ambient per-prompt cost by default. The `SessionStart` hook fires once per session and loads three small files. Distill, promote, compile, and export run user-invoked. Operator injection and enforcement are explicit opt-ins that document their cost at the point of opting in. Any always-on surface either fits inside the cold-start budget or ships off by default.

## Commitments

- The machine store is canonical. The human-readable narrative regenerates from entries, never hand-authored.
- Contradictions are never silent overwrites. Both entries preserved. The disagreement is queryable.
- Constraints require back-pressure targets. A rule the agent can ignore is not a rule.
- Entries carry `valid_from` and `valid_through`. Retrieval treats them as "as-of" records. The AI Index 2026 finding on belief-vs-fact vulnerability (DeepSeek R1 dropping from 90%+ to 14.4% accuracy on false-user-belief framing) is a design constraint.
- Operator context at init is minimal: `as_of`, role if volunteered, detected back-pressure targets, optional verbatim quotes. Paraphrased preference / thinking-style / goals arrays are refused by design — same belief-vs-fact constraint. Operator attributes accrue from real sessions via `/priors:distill`, not from an interview before any work has happened.
- Store format is plain files (YAML / JSON / Markdown). Claude Code is the reference implementation; future adapters for Codex / Cursor / etc. read the same sediment.
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
