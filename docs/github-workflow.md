# GitHub workflow for `worklog`

This is the recommended day-to-day flow for this MCP server repository.

## 1) Start work from `main`

```bash
git checkout main
git pull
git checkout -b feat/short-topic
```

Use branch prefixes:

- `feat/` new behavior
- `fix/` bug fixes
- `chore/` maintenance
- `docs/` documentation only

## 2) Commit in small, meaningful steps

Use Conventional Commits:

- `feat: add X`
- `fix: prevent Y`
- `docs: clarify Z`
- `test: cover A`
- `refactor: simplify B`
- `ci: update workflow C`

## 3) Validate locally before push

```bash
npm test
```

If tests fail, fix them before pushing.

## 4) Open a PR (do not merge directly to `main`)

PR should include:

- why this change exists
- what changed
- test evidence
- risk/rollback notes if behavior changed

Keep PRs small and single-purpose.

## 5) Merge when CI is green

The repository CI currently runs on:

- pushes to `main`
- pull requests

Treat a failing CI run as a hard stop for merging.

## 6) Create tags and releases intentionally

Use tags only for meaningful shipped milestones from `main`.

Semver guidance:

- `v0.x.y`: pre-1.0 evolution
- patch (`x.y.Z`): bug fixes
- minor (`x.Y.z`): backward-compatible feature
- major (`X.y.z`): breaking change

Example:

```bash
git checkout main
git pull
git tag v0.3.0
git push origin v0.3.0
```

This repo includes automation: pushing a `v*.*.*` tag creates a GitHub Release automatically with generated notes.

### Practical release cadence

Use this simple rule:

- tag and release when users would care (new capability, important fix, or stability milestone)
- do not tag every commit
- if you are unsure, skip the tag until the next meaningful milestone

## Branch protection (strongly recommended)

Configure branch protection for `main` in GitHub settings:

- require a pull request before merging
- require status checks to pass (select your `CI` workflow)
- require branch to be up to date before merge
- block force pushes
- block branch deletion (optional but recommended)
- include administrators if you want strict enforcement for everyone

This is the real guardrail that prevents accidental direct pushes.

## MCP-specific repo standards (v1)

- Keep runtime dependencies at zero unless intentionally approved. The runtime imports `.ts` directly via Node 25 type stripping; dev-only types are fine.
- Preserve strict input validation and path traversal protections (`additionalProperties: false` on every MCP schema; resource IDs match `^[a-z0-9-]+$`).
- Keep audit trail behavior intact: every write, link, mark-stale, distillation reject, and import appends to `.priors/audit/actions.log` (JSONL).
- Preserve the quote-or-refuse rule in `stage_learning`. Verification is enforced in code (substring match), not in prompt text.
- The brief is deterministic. Two runs against the same store produce byte-identical output. Snapshot tests in `tests/snapshots/brief/` enforce this.
- Update docs and tests in the same PR when protocol or behavior changes.

## Returning to the legacy v0.3 implementation

The pre-rejig MCP server (with `~/.priors`, decay scoring, `priors.reinforce`, `priors.emitConstraint`) is preserved at the tag `legacy/v0.3.0`:

```bash
git checkout legacy/v0.3.0
```

It is not maintained on `main`/`reval`.
