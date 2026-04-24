# fresh-empty fixture

Truly empty. No `package.json`, no `tsconfig.json`, no CI, no commits. Used as the test fixture for `/priors:init`'s Flow B (fresh repo) path — the inference helpers in `lib/init/` should all emit nothing against this tree.

The expected observable outcome: `/priors:init` identifies this as Flow B, asks exactly the three project-shape questions, writes a short `HEAD.md` (~30–40 lines) with `[volunteered]` tags only, and seeds 0 or 1 entries depending on the Q3 answer.

To drive this fixture, start a Claude Code session with cwd set to this directory. Do not commit anything before running — one of Flow B's signals is the absence of prior commits.
