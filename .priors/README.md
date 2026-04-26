# `.priors/` — this project's record of itself

This directory is the Priors store for the `priors` repository itself. It is committed to the repo and travels with it.

The persistent subject is the project — not the user, not the AI. See [`AGENTS.md`](../AGENTS.md) and [`docs/project-brief.md`](../docs/project-brief.md) for the framing.

## Layout

```text
project.json         # UUID, name, created_at
entries/             # active entries, by kind
  decisions/
  failures/
  constraints/
  patterns/
  questions/
  hypotheses/
staged/              # candidates awaiting user approval
indexes/all.json     # regenerated on every write
audit/
  actions.log              # JSONL: every write
  distillation-rejects.log # candidates that failed verification
exports/             # produced by `priors export`
brief.md             # rendered by `priors brief`
log.md               # chronological state
```

## What's here today

The seed entries below were captured during the v0.3 → v1 rejig (see `pri-20260426-decay-and-emit-overreach` for the full v0.3 → v1 reasoning).

| Kind | Count |
|---|---|
| Active decisions | 5 |
| Active constraints | 5 |
| Active failures | 1 |
| Open questions | 3 |
| Staged | 0 |

To see the rendered brief:

```bash
cat .priors/brief.md
# or, once the CLI is implemented:
priors brief
```

## Contributing

Do not edit entries by hand once the CLI/MCP server is in place. Use:

```bash
priors stage <...>      # stage a candidate
priors commit <id>      # promote staged → active
priors mark-stale <id>  # soft state change
priors link <a> <rel> <b>  # add a relation
```

Until then (during early v1 implementation), hand-edits are acceptable as long as `indexes/all.json` and `audit/actions.log` are updated in the same change.
