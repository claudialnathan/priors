# Priors — project brief

**Status**: living document
**Owner**: claudialnathan
**Companion specs**: `spec-brief-resource.md`, `spec-staged-distillation.md`, `claude-code-handover.md`

## Positioning

Priors is the project's record of itself. Decisions, dead ends, constraints, open questions — written by the agents working on a project, curated by the human, readable by whoever shows up next. It is not a memory feature for an AI. It is a trail the project leaves for future agents and future humans.

> Priors records why a project moves the way it does, so fresh agents can make better decisions without rediscovering the same context.

The persistent subject is the project, not the user and not the AI. This single reframe is the product's center of gravity. Every other design decision flows from it.

## Why this is a different category

The agent-memory space is saturated. Hermes, claude-mem, Mem0, Letta, Zep, ChatGPT memory, Claude memory — all of them answer the same question: *what does the AI know about me?* That category is going to commoditize within 18–24 months (the AI Index data already supports this), and "we do memory but better" is not a positioning that survives commoditization.

Priors competes in a different category: a project record. The closest analogues are not memory tools at all. They are:

- `git log` and `git blame`, which give a codebase a continuous record of why it changed. Priors does that for the *reasoning* layer, which has always lived in heads, in deleted PRs, and in Slack threads that got archived.
- A wet lab notebook — a durable record of what was tried, by whom, with what reagent, and what happened.
- An aviation incident log — institutional memory of failures, structured so the next pilot does not repeat them.
- The folder of notes a contractor leaves on a job site for the next crew.

None of these things describe themselves as "memory." They describe themselves as *records*. That is the better word for what Priors is.

The mechanical advantages of having the project as the subject:

- **Team coherence without privacy invasion.** "AI memory of me" cannot be shared. "Project's record of itself" can be. Multi-person collaboration is natively coherent.
- **Survives client and model changes.** The artifact is in the repo. Whether the next session is in Claude, Cursor, Codex, or a 2027 tool nobody has seen, the substrate carries.
- **Auditable.** As frontier models get more opaque (Foundation Model Transparency Index dropped from 58 to 40 in one year), the user's own curated layer becomes the only inspectable surface. Priors *is* that layer.
- **Avoids the belief-vs-fact failure mode.** A user-memory product that stores "user prefers X" injects exactly the pattern that breaks LLMs (GPT-4o falls from 98% to 64% accuracy when false claims are reframed as user beliefs). A project-record product stores "as of April 12, the team chose X because of Y, evidence in commit abc." That is a different epistemic object — it survives stale-belief retrieval because it was never present-tense to begin with.

## Target audiences

Priors has three concentric audiences, each with a different reason to care.

### Inner circle — the people who will adopt first

**Solo developers running multiple AI clients on the same project.** They feel the pain of context loss every time they switch from Claude to Cursor, or restart a long-running task, or come back to a project after two weeks. They are technical enough to install an MCP server and care enough about reproducibility to maintain a `.priors/` folder. This is the cohort whose adoption looks like organic distribution — they tweet about it, blog about it, file PRs.

The pitch to them: *Stop re-explaining your project to a fresh agent. Stop repeating debugging paths you already ruled out. Make the project itself smart enough to brief whoever shows up.*

### Middle circle — small teams shipping with AI assistance

**Engineering teams of 2–10 people where AI agents are doing real work in the codebase.** They feel the pain of decision drift across team members and across agents. They have an opinion about how their codebase should look but no good way to encode reasoning that explains *why*. CLAUDE.md works for static rules; nothing works for living context.

The pitch to them: *Your `.priors/` folder is the team's shared memory of why your codebase looks the way it does. New hires read it. Agents read it. It travels with the repo.*

### Outer circle — researchers and tinkerers

**People building agent harnesses, memory systems, or coding tools.** They are the ecosystem audience that drives credibility. If Priors is taken seriously by Hermes-adjacent, claude-mem-adjacent, Mem0-adjacent communities, the inner and middle circles follow.

The pitch to them: *Priors is the substrate. It is what an agent runtime should write to and read from when it cares about durable context. Use it under your tool.*

These audiences don't conflict. The same product serves all three; only the surface message changes.

## The headline rituals

Seven concrete interactions, each in `human-job → moment → primitive` form. The first three are the v1 headline. Everything else supports.

1. **Brief the new arrival.** *I have ten minutes to get a fresh agent up to speed.* → start of any new session → `priors://brief`.
2. **Recall the dead ends.** *I have a nagging feeling we already ruled this out.* → start of a new sub-task → `recall(kind: failure)` (CLI: `priors recall --kind failure`) returning failure entries and rejection context.
3. **Stage the takeaways.** *Hard problem cleared, I want the lesson to stick without breaking flow.* → end of a session → `stage_learning` / `priors stage`, then `commit_learning` / `priors commit` to promote to active.
4. **Show me what's contested.** *Something feels off; what changed?* → review or onboarding → `recall(status: contested)` with both sides preserved.
5. **Date the claims.** *Is this fact still true?* → before relying on retrieved info → every entry retrieved with `as_of` framing.
6. **Decide and record.** *I'm about to make a non-obvious choice, leave a trail.* → moment of decision → templated `decision` entry.
7. **Hand off the pack.** *Teammate joining, or new laptop, or contractor briefing.* → handoff event → `export` + `import --dry-run`.

## V1 scope

In:

- Local store at `.priors/` (markdown + frontmatter, JSON for state files)
- MCP server with three resources (`priors://brief`, `priors://index`, `priors://entry/{id}`) and six tools (`recall`, `get_entry`, `stage_learning`, `commit_learning`, `mark_stale`, `link_entries`)
- CLI wrapping the same store/logic
- `export` and `import --dry-run`
- Deterministic brief assembly, hard-bounded
- Conservative staged distillation with mandatory quoted evidence
- Regression suite (the AGENTS.md eval list)
- Setup docs for at least three MCP clients
- The `.priors/` folder structure should be readable by a human in their text editor without explanation

Out (deferred):

- Active decay scoring
- Helpful/harmful retrieval counters
- Auto-distillation hooks (manual `priors distill` is the path)
- `emit_constraint` (back-pressure to executable checks)
- Multi-project / team-shared store
- Web UI / dashboard
- Vector store / embedding-based search
- Cloud sync
- Mobile/phone access

The v1 cut is intentionally tight. Each deferred item is reviewed in the future considerations section below with what would be required to ship it well.

## Communicating Priors as a product

The hardest non-technical question: how do we make this immediately understandable to a person who has not read the AGENTS.md.

### The headline pitch (one sentence)

> A logbook for your AI-assisted projects: decisions, dead ends, and constraints — written by your agents, curated by you, readable by whoever (or whatever) shows up next.

### The 30-second demo

Open a project that has Priors installed. Run `priors brief`. Show the assembled output: 7 active decisions with dates, 4 known dead ends with reasons, 2 open questions. Say: *this is what my project knows about itself. Any agent I run on it sees this first.* Switch from Claude Code to Cursor mid-demo. Run `priors brief` again — same output. *Same record, regardless of the tool.*

That's the demo. It works because the artifact is real and inspectable, not invisible.

### The artifact as proof

The `.priors/` folder in the repo is the product's strongest argument. People can `cd` into it, `cat` an entry, see the structure. It is not a service running somewhere — it is a thing they own. This is the opposite of how user-memory products feel.

In all marketing, the visible artifact should be foregrounded. Screenshots of the folder structure. Examples of real entries. The brief output as a code block. Don't sell the agent; sell the trail.

### What to say when someone asks "isn't this just X?"

| Question | Answer |
|---|---|
| "Isn't this just markdown notes?" | Markdown notes don't have IDs, schemas, or causal links. And they don't have a brief that assembles itself. The notes are the substrate; Priors is what makes them legible to agents. |
| "Isn't this just RAG?" | RAG retrieves what exists. Priors records why the project moved. RAG can't tell you *what was rejected*. Priors can. |
| "Isn't this just CLAUDE.md / AGENTS.md?" | CLAUDE.md is configuration — stable instructions. Priors is trajectory — why the project is shaped the way it is, including the things that aren't true anymore. |
| "Isn't this just claude-mem / Hermes?" | Claude-mem records observations from Claude Code sessions. Hermes is an agent with a memory. Priors is neither — it is the project's own record, readable by both of those tools and anything else. |
| "Isn't this just a wiki?" | A wiki is a flat document store. Priors has typed entries (decisions, failures, constraints), causal links, and a deterministic orientation surface. Wikis don't tell you what was tried and rejected; they hide that history. |

These are not gotchas to win arguments. They are the conceptual differentiators that should be repeated in docs, blog posts, and demos until they stick.

### Metaphors that work

- "Logbook"
- "Trail" or "trail of decisions"
- "Briefing folder"
- "Black box recorder for projects"
- "git log for thinking"

### Metaphors that don't work

- "Brain" or "second brain" (wrong subject — implies user as subject)
- "Memory" (saturated category, wrong frame)
- "AI assistant memory" (collapses Priors into the consumer-memory space we are explicitly avoiding)
- "Knowledge base" (too static; misses the trajectory aspect)

### Distribution strategy (lightly)

The path that aligns with the product:

- **GitHub-first.** A great README, a clear `.priors/` example folder in the repo itself (dogfood), and an install via `npx`.
- **Demo videos showing the cross-client switch.** Claude → Cursor → Codex, same brief, same trail. This is the visceral demonstration.
- **A handful of well-written posts in the harness-engineering / agent-memory adjacent communities.** The articles in `articlescontext.md` are the right register and audience.
- **A "Priors-equipped" badge for repos that adopt it.** Trivial to ship, useful for discovery.
- **Resist a vector-DB / cloud version.** That's a different product. Maintain the local-first identity.

## Future considerations

What was deferred from v1, what would be required to ship each well, where each could fall apart, and where each could be "faked" badly.

### Active decay scoring

**What it is**: a retrieval-time priority adjustment based on `last_retrieved`, `helpful_count`, `harmful_count`, and time since last confirmation.

**What it needs to ship well**: enough volume of stored entries that priority reweighting actually changes outputs (likely > 200 entries per project), and a working feedback loop where retrievals are tagged as helpful or harmful in real use. Without that loop, the counters are decorative.

**Where it could fall apart**: if helpful/harmful tagging is noisy or biased (e.g., users tag entries they like, not entries that helped), decay scoring degrades retrieval rather than improving it. There is a real risk of learning on bad signal.

**Where it could be faked**: any system can claim to have decay. Without showing the score, the half-life calibration, and side-by-side retrieval comparisons before and after decay, the feature is performative. The MemoryBank paper claims forgetting curves; the benchmark scores don't impress. Be wary of shipping decay as a marketing point without the eval to back it.

**Earliest credible version**: tag entries with `as_of` and `last_retrieved`, rank ties by recency, expose `mark_stale` as a manual user action. That's 80% of the value of decay with none of the inference burden. Keep this as the v1 mechanism and only add automated scoring if benchmarks show it's worth the complexity.

### Auto-distillation hooks

**What it is**: hooks that fire on session-end and run distillation against the transcript automatically, staging proposals without the user typing `priors distill`.

**What it needs to ship well**: a trust threshold — users must already know that the distillation prompt is conservative. The first incident where a hook stages something embarrassing kills adoption. Also, the transcript files themselves need to be private by default and never committed to the repo.

**Where it could fall apart**: silent capture creates surveillance feel. If a user has a session where they discuss a competitor or a confidential plan, and Priors stages a candidate about it, the trust hit is large. The deeper risk is *implicit consent*: the user opted in to "memory" but didn't opt in to "the system reads everything I say to my agent."

**Where it could be faked**: this feature can look great in demos because the model produces interesting candidates from any rich session. The fakeness is in the integration story — does the user actually approve them? Do they get filed correctly? Or do they pile up in `staged/` until the user gives up and deletes the folder?

**Earliest credible version**: hooks generate transcript files only. No automatic distillation. The user runs `priors distill <transcript>` manually when they're ready. This costs 30 seconds; it buys all of the trust. Reconsider auto-staging only after the manual flow has been used in real projects for months.

### `emit_constraint` (back-pressure to executable checks)

**What it is**: a tool that translates a Priors entry — "never auto-commit staged memory proposals" — into an executable artifact: a pre-commit hook, a test, a linter rule, or a CI check.

**What it needs to ship well**: high-fidelity natural-language-to-code translation. The `research.md` documents the empirical baseline (15–88% hallucination, mitigated to <2% only with verification-in-the-loop). Shipping this in v1 means either (a) brittle output that fails in front of users or (b) verification-in-the-loop architecture that overwhelms the rest of the product.

**Where it could fall apart**: a generated pre-commit hook that incorrectly blocks commits, or a generated test that always passes, or a generated linter rule that triggers on the wrong patterns. Each of these silently degrades the user's project. The damage compounds because the user trusts the artifact came from a Priors entry.

**Where it could be faked**: a tool that emits a hook stub with a TODO comment looks like the feature shipped. It isn't the feature. The feature is *the hook actually enforces the constraint*. Without integration tests against real codebases, the emit feature is a façade.

**Earliest credible version**: emit a *natural-language description of what the check should do*, plus a starter scaffold the user completes. Don't generate the executable artifact; generate the spec for it. The user writes the actual check, and links it back to the Priors entry via `emitted_as`. This is much less impressive but actually works.

### Multi-project / team-shared store

**What it is**: a Priors store that multiple humans (and their agents) write to, with proper scoping, conflict resolution, and access control.

**What it needs to ship well**: identity, permissions, conflict resolution UX, sync mechanism. Each of these is a substantial product on its own. The naive "git-based sync" approach has merge conflict semantics that don't translate well to typed entries with relations.

**Where it could fall apart**: two people stage contradictory entries, both commit, and the resulting state is incoherent. Or one person's local edits overwrite another's. The trust failure here is "I committed a learning and it disappeared."

**Where it could be faked**: shipping team support that just means "everyone has their own .priors/ in the same repo" is a multi-user store, not a multi-user product. It doesn't solve coherence.

**Earliest credible version**: well-defined export/import packs, with `import --dry-run` and conflict reporting. People can share state explicitly without a sync mechanism. This is what v1 already targets. Real team mode is v3 territory.

### Web UI / dashboard

**What it is**: a graphical interface for browsing, editing, and curating entries.

**What it needs to ship well**: a coherent design, an opinion about what the UI is for that the CLI / MCP isn't, and ongoing maintenance. The default failure is to make a UI that does what the CLI already does, badly.

**Where it could fall apart**: feature-creep into a "memory dashboard" that competes with itself. Once a UI exists, every request comes through it ("can it show graphs," "can I pin entries," "can it integrate with Notion"). The local-first identity erodes.

**Where it could be faked**: any read-only HTML rendering of `.priors/` looks like a UI. The actual product question is whether curation gets faster with a UI than without. For 80% of users, no.

**Earliest credible version**: a `priors view` CLI command that opens the local store in the user's preferred markdown editor (VS Code, Obsidian, vim) with an opinionated index. No web UI needed.

### Cross-project pattern detection

**What it is**: a layer above individual projects that surfaces patterns across many `.priors/` stores — "you've adopted this constraint in 4 projects, want to make it a default?"

**What it needs to ship well**: enough projects, a way to opt into cross-project analysis, and a UX for handling the privacy implications of cross-project reasoning.

**Where it could fall apart**: this is the feature that quietly turns Priors into the consumer-memory products it explicitly competes with. The whole point is that the project is the subject; cross-project analysis re-centers the user.

**Where it could be faked**: a "patterns dashboard" that just searches across folders is not pattern detection. Real cross-project insight requires understanding when constraints in different projects are semantically equivalent.

**Earliest credible version**: a manual `priors export-pattern` command that lets the user explicitly distill a constraint into a portable form they can import into other projects. Keeps the user in the loop and avoids the surveillance frame.

## Risk register

The product-shaped risks worth tracking even before v1 ships.

1. **The "memory" frame leaks back in.** Every demo, blog post, and tweet wants to call this "memory." Every comparison wants to put it next to Mem0 and ChatGPT memory. Holding the project-record positioning in marketing requires discipline — one slip and the category collapses back. Mitigation: a positioning checklist in this doc, applied to every public artifact.

2. **The emit-constraint feature ships before it works.** Pressure to demonstrate the back-pressure idea will be high. Shipping a brittle version damages trust in the whole product. Mitigation: explicit deferral in v1, replaced by the spec-emission scaffold described above.

3. **Distillation hallucinates a confident lie.** Even with the verification step, edge cases will slip through. The first time a user catches Priors staging a fabricated rule, the product loses credibility. Mitigation: aggressive regression testing, public commitment to the "quote or refuse" rule, and a `priors audit` command that shows distillation rejects so users can see what was filtered.

4. **The brief fails on first impression.** If a new user runs `priors brief` and gets something cluttered, slow, or weirdly empty, they don't come back. Mitigation: snapshot tests for both empty and rich states; obsessive attention to the first-run UX.

5. **The product gets pulled into being an agent runtime.** The temptation to add agent-loop features (planning, execution, tool use) will be constant. Doing so loses to Hermes. Mitigation: clear stated boundary — Priors is substrate, not runtime — repeated in docs and in design reviews.

6. **The local-first identity is eroded by sync requests.** Users will ask for cloud sync, mobile access, team mode. Each is reasonable; together they pull the product toward SaaS. Mitigation: keep export/import as the bridge, treat sync as a v3 question, communicate the local-first principle as a feature.

7. **Adoption stalls because there's no immediate "wow" without a populated store.** Empty Priors is just an empty folder. Users don't experience the value until they've filed 5–10 entries. Mitigation: a populated demo project shipped with the install, plus a `priors quickstart` flow that walks the user through staging their first 3 entries.

## What this brief does not yet decide

- **Pricing model.** Open source MIT for v1 is the assumption. Whether there's a commercial layer later (hosted team mode, Priors Cloud) is a v3+ question.
- **Brand and naming.** "Priors" is a strong name in the right communities and a confusing name to most others. Whether to keep it or rebrand for broader adoption is open.
- **Onboarding for non-developer users.** v1 targets developers. Whether there's a path for researchers, writers, or PMs is open and probably depends on adoption telemetry.
- **The exact governance of contested entries.** When two people disagree, the spec says both sides remain inspectable, but the resolution UX is undefined. This is a v2 question.
