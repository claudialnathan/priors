---
id: pri-20260426-in-repo-store
kind: decision
status: active
confidence: high
as_of: 2026-04-26
created_at: 2026-04-26T05:30:00Z
updated_at: 2026-04-26T05:30:00Z
claim: "The Priors store lives at <project-root>/.priors/, in the project's own repo. There is no shared ~/.priors directory."
relations:
  supersedes: []
  contradicts: []
  reinforces: []
  derived_from: []
tags:
  - store
  - architecture
  - identity
---

## Why

The persistent subject is the project, so the store travels with the project. v0.3 used `~/.priors/projects/<repo-id>/` to keep the store out of the user's repo, which made the data portable across machines but also made the store invisible to PRs, code review, and any tool that operates on the working tree.

In v1 the store is committed to the repo by default. PRs can be reviewed alongside `.priors/` changes. A clone is a complete handoff. There is no out-of-band sync step.

## Implications

- `.priors/` must be removed from `.gitignore` (done — see `.gitignore`).
- Identity is the UUID in `.priors/project.json`, not the directory path. Tests verify identity survives `mv`.
- Users who do not want `.priors/` committed can add it to their own `.gitignore`; the default is committed.
- Multi-machine users get sync for free via Git.

## Risks

- A noisy contributor could pollute `.priors/` with low-quality entries. Mitigation: `staged/` requires explicit `commit_learning`; nothing auto-promotes.
- Repo size grows with audit log over time. Mitigation: `priors export` produces a portable snapshot; `audit/actions.log` can be rotated.
