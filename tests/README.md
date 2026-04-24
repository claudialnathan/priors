# Priors test suite

One contract test, run via `make test`.

```
tests/
  contract/
    test-hooks.sh    # audits the two Phase 1 hooks — silent-failure guard,
                     # correct path, correct tag shape, 5-preference cap
```

## Invariants the hook test guards

- Both hooks `set -e*` — no swallowed errors.
- `session-start.sh` emits `<priors-cold-start>` pointing at
  `~/.claude/projects/<slug>/priors/` (the new project-scoped path —
  the SDK `memory.view` / `/memories/` idiom is a regression).
- `user-prompt-submit.sh` exits silently when `operator.yaml` is absent
  (no nagging on every prompt) and caps preference injection at 5 bullets
  when present (token economy).

## What this suite deliberately does NOT cover

Schema validation, live-store integrity, and transcript simulation are
all deferred. Phase 1 ships a scaffold; the value question is answered
by using the plugin manually, not by LLM-judged eval harnesses. See
`internal/phase-1-spec.md` for the shipping criterion.
