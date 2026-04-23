# priors

> A project's trajectory becomes legible to future agents as causality, not as retrieval.

`priors` is a typed, project-scoped dataset of the decisions, corrections,
constraints, dead-ends, and patterns that accrue across coding sessions.
It runs on Anthropic's `memory_20250818` tool and installs into any
project as a Claude Code skill with slash commands and a cold-start hook.

It is not a notes app, a memory layer, or a chat-history summariser. It
is the structured trajectory dataset a project carries forward between
context resets.

---

## The idea

Most "agent memory" work treats the agent as the protagonist and memory
as infrastructure the agent uses. `priors` inverts that.

**The project's trajectory is primary. Agents are transient participants
in it.** The sediment persists; agents come and go against it.

Agent-primary tools optimise for a smarter, more capable agent.
Trajectory-primary tools optimise for the project developing legible
shape — a stance future agents inherit without being told. These are
genuinely different products, and they point at different features. If
you read the priors for a project you've never seen and come away with a
sense of what gets accepted there, the tool is doing its job. If you
don't, it's a fancy notes directory and the framing was wrong.

That's the wager.

---

## What it fixes

Three gaps show up across every serious piece of memory/harness work
(ACE, ReasoningBank, Anthropic's harness-design-long-running-apps,
humanlayer's CLAUDE.md critique):

1. **Untyped free-text loses causality.** "We chose X" buries the
   decision. Six months later you can't ask *what else was considered,
   when would we revisit.* `priors` entries are typed —
   `correction`, `decision`, `dead-end`, `pattern`, `constraint`,
   `open-question`, `operator` — each with its own schema. The retrieval
   question is "what did we decide," not "what did we say."

2. **Contradictions are silent overwrites.** Most stores append or
   overwrite when a new learning conflicts with an old one — and the
   disagreement itself is high-signal. `priors` preserves both.
   `supersedes` / `superseded_by` is a bidirectional graph, not a status
   flag. Old layers keep their shape after they stop being current.

3. **Notes don't produce back-pressure.** A rule in a notes file depends
   on the agent remembering to read it. The lessons that actually
   compound are the ones the environment refuses to let you violate.
   Promoting an entry to `constraint` requires an explicit enforcement
   target (pre-tool-use hook, system-reminder, lint rule). Descriptive
   entries without enforcement are `note` and decay.

---

## The store

```
/memories/priors/
  HEAD.md              # cold-start orientation — read first, every session
  operator.yaml        # who's working on this project, as of when
  state.json           # live pointers — branch, active feature, open PRs
  index.json           # machine index of active entries
  entries/             # typed YAML, one file per entry, date-prefixed
  compiled/            # Phase 3 — regenerated human view + hook reminders
  archive/             # retired entries
```

Directory-backed, not a DB. On purpose: portable, git-friendly,
grep-friendly, diff-friendly, survives tool migrations. You can open
`/memories/priors/` and understand what's going on in under a minute
without running the tool.

The format *is* the abstraction. Any agent that speaks `memory_20250818`
and respects the typed entries shares the sediment. No orchestration
primitives. Coordination-free multi-agent, because the format is the
coordination.

---

## Install

Copy the `.claude/` directory into a project (or symlink, or vendor it
however you prefer). Then:

```
/priors-init
```

That bootstraps `/memories/priors/`, interviews you briefly for the
operator context, and writes `HEAD.md`. After that, every fresh Claude
Code session in the project cold-starts from the priors automatically —
no CLAUDE.md bloat, no ambient per-prompt tokens, just one reminder at
session start pointing the agent at the store.

---

## Commands (Phase 1)

| Command | What it does |
|---|---|
| `/priors-init` | Bootstrap the store; interview for operator context |
| `/priors-log` | Write one typed entry for work that just happened |
| `/priors-recall <query>` | Search by tag, type, substring, or file path |
| `/priors-state` | Refresh `state.json` from the working tree |
| `/priors-index` | Regenerate `index.json` (after manual entry edits) |
| `/priors-auto-on` | Opt into per-prompt operator injection (~200 tok/prompt) |
| `/priors-auto-off` | Revert to cold-start-only |

Token budget is load-bearing. **Default posture: zero ambient per-prompt
cost.** The cold-start hook fires once per session and reads three small
files. Everything else is user-invoked or explicit opt-in. If a future
phase adds an always-on surface, it either fits inside the cold-start
budget or ships as opt-in.

---

## What it does not do yet

Phase 1 makes the tool *exist*. Phase 2+ makes it *different*.

- **No automatic distillation.** `/priors-distill` is stubbed. Phase 2
  runs a sub-agent over session transcripts and proposes typed entries
  as a reviewable diff — never auto-write.
- **No compilation.** Phase 3 regenerates `compiled/narrative.md` (human
  view) and `compiled/harness-reminders.md` (hook-injected) from the
  typed store, deterministically. Both emit as reviewable diffs, never
  auto-applied. No auto-generated CLAUDE.md — humanlayer documented that
  class of bloat as an active performance regression; `priors` avoids it
  on purpose.
- **No enforcement surface.** Phase 4 emits pre-tool-use hooks,
  system-reminders, and evaluator criteria from promoted constraints.
- **No schema validation at write time.** The schema is a template file
  the agent reads when creating entries. Phase 2 adds validation.

---

## What we refuse to do, ever

- **No hand-authored human narrative.** The machine store is canonical;
  the human view is compiled. `compiled/narrative.md` is output only —
  never cited as source for a new entry, because reflection-echo loops
  drift.
- **No silent overwrites on contradiction.** Contradictions are
  first-class objects. Both entries preserved; the disagreement is
  queryable.
- **No constraints without back-pressure targets.** A rule the agent can
  ignore is not a rule.
- **No timeless user-belief storage.** Every entry has `valid_from` /
  `valid_through`. Retrieval treats entries as "as-of" records. The
  AI Index 2026 data on belief-vs-fact vulnerability (DeepSeek R1
  dropping from 90%+ to 14.4% on false-user-belief framing) is a design
  constraint, not a footnote.
- **No model-specific coupling.** The format is tool-agnostic. Claude
  Code is the reference implementation; the format should outlive it.

---

## Status

Phase 1 scaffold is in place: skill, slash commands, two hooks, schema.
End-to-end testing against the live `memory_20250818` tool is **still
pending**. The first real test is a fresh Claude Code session →
`/priors-init` → see `/memories/priors/` get populated. Expect rough
edges until that lands.

Phases 2–5 are designed but unbuilt. The phase boundaries are
deliberate — this repo will not add Phase 2 features until Phase 1
works end-to-end on a real project.

---

## Success criterion

If, in six months, a fresh Claude Code session given only a project's
priors (no conversation history) can predict what would get accepted or
rejected in that project on held-out cases — proposed changes, framings,
approaches — the format is doing its job. Project shape is inherited,
not told.

That's the test. Not retrieval accuracy. Not adoption count. Trajectory
legibility.

---

## Where to look

- [`.claude/skills/priors/SKILL.md`](.claude/skills/priors/SKILL.md) — the
  instruction layer Claude loads contextually
- [`.claude/commands/`](.claude/commands/) — one file per slash command,
  self-documenting
- [`.claude/hooks/`](.claude/hooks/) — cold-start orientation + optional
  per-prompt operator injection
- [`.claude/settings.json`](.claude/settings.json) — ships the
  `SessionStart` hook registration. Personal permissions/MCP live in
  the gitignored `settings.local.json`.

---

## Lineage

Reflexion (2023) → Dynamic Cheatsheet (Apr 2025) → ACE (Oct 2025) →
ReasoningBank (NeurIPS 2026).

Three convictions appear in every serious piece of work in this lineage:

1. **Compression loses signal you can't predict at capture time.**
   Preserve detail; let the model filter at read time. (ACE)
2. **Failures are more valuable than successes for learning.** Most
   systems don't capture them. (ReasoningBank)
3. **Curation is the product.** Storage and retrieval are solved. What
   to keep, what to promote, what to decay — that's where differentiation
   lives.

Closest precedents and what they don't do: claude-mem captures episodes
but doesn't emit harness artifacts. Karpathy's LLM Wiki compiles
knowledge but is read-only — it doesn't modify the environment.
Anthropic's `/team-onboarding` is a narrow first-party slice of
"compile local usage into shareable output" — user-scoped, not
decision-scoped. Mercury's Second Brain is personal-scoped, not
project-scoped, and has no typed curation.

`priors` sits downstream of all of these. The thing it does that none
of them do: **emit harness artifacts from curated typed entries so that
the environment enforces the lesson, not the agent's memory.**

---

## License

TBD.
