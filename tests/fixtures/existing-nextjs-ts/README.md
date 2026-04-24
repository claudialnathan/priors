# existing-nextjs-ts fixture

A minimal but real Next.js 15 + TypeScript 5 project, used as a test fixture for `/priors:init`'s Flow A (existing codebase) path.

## What this fixture is for

`/priors:init` dispatches on repo state. The "existing codebase" path expects to see signals like a populated `package.json`, a `tsconfig.json` with strict mode, a lockfile that identifies the package manager, a CI workflow, and a README longer than 40 lines. This fixture carries all of those, sized down to the minimum that still exercises each detection branch of the inference helpers in `lib/init/`.

## What it contains

- `package.json` — declares Next.js 15.2, React 19, TypeScript 5.4, Vitest 1.6, Biome 1.9. `engines.node` set to 20.
- `tsconfig.json` — strict mode on, bundler module resolution, Next.js plugin loaded.
- `pnpm-lock.yaml` — header-only, enough for `detect-stack.sh` to identify pnpm as the package manager.
- `.nvmrc` — alternate source for Node version; `detect-stack.sh` prefers this over `engines.node`.
- `.github/workflows/test.yml` — a single workflow running typecheck, lint, and unit tests on PR and main pushes.
- `biome.json` — the lint config, picked up by `detect-back-pressure.sh` as a `lint` target.
- `vitest.config.ts` — test-framework detection signal for `detect-ci.sh`.
- `src/app/page.tsx` — a minimal Next.js App Router page so the file tree has non-scaffold content.

## What it deliberately does not contain

- No `vercel.json` / `netlify.toml` / `Dockerfile`. The fixture exercises the "deploy target unknown" branch — `/priors:init` should list deploy target under "Unable to determine" rather than guessing.
- No git history. When a fixture test drives `/priors:init` against this directory, it should explicitly `git init && git add -A && git commit -m "fixture"` first to give the inference helpers something to read from `git log`.
- No `CLAUDE.md` or `AGENTS.md`. Separate fixtures will cover the external-agent-file conflict path.
- No `.husky/` directory. The fixture tests the "no pre-commit hook detected" branch; a sibling fixture can cover the pre-commit-hook-present branch when that test lands.

## How to use it

From the plugin repo root:

```bash
cd tests/fixtures/existing-nextjs-ts
git init -q
git add -A
git commit -qm "fixture"
# drive /priors:init manually via a Claude Code session launched with
# claude --plugin-dir ../../../ and cwd set to this directory
```

The expected observable outcome: `/priors:init` identifies this as Flow A, lists Next.js 15.2 + TypeScript + pnpm + strict + Vitest under auto-applied inferences, asks at most two questions (hard constraints / dead-ends), writes `HEAD.md` under 60 lines, and produces an empty `entries/` directory.
