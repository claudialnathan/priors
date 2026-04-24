#!/usr/bin/env bash
# detect-back-pressure.sh — locate enforcement points that could act as
# back-pressure targets for constraint entries. A constraint without a
# target gets demoted to note; surface what's available up front.
#
# Emits one line per target: <kind>=<path>
# Kinds: hook, lint, format, typecheck, ci.

set -uo pipefail

# --- pre-commit hooks -------------------------------------------------------

if [[ -f .husky/pre-commit ]]; then
  echo "hook=.husky/pre-commit"
elif [[ -f .pre-commit-config.yaml ]]; then
  echo "hook=.pre-commit-config.yaml"
elif [[ -f .git/hooks/pre-commit ]] && [[ ! -L .git/hooks/pre-commit ]]; then
  # real file, not the .sample symlink target
  if ! grep -q '^# Hook was installed by' .git/hooks/pre-commit 2>/dev/null; then
    echo "hook=.git/hooks/pre-commit"
  fi
fi

# --- lint -------------------------------------------------------------------

for f in biome.json biome.jsonc .eslintrc.json .eslintrc.yml .eslintrc.yaml \
         .eslintrc.js eslint.config.js eslint.config.mjs eslint.config.ts; do
  if [[ -f "$f" ]]; then
    echo "lint=$f"
    break
  fi
done

# --- formatter --------------------------------------------------------------

for f in .prettierrc .prettierrc.json .prettierrc.yaml .prettierrc.yml prettier.config.js prettier.config.mjs; do
  if [[ -f "$f" ]]; then
    echo "format=$f"
    break
  fi
done

# --- typecheck --------------------------------------------------------------

if [[ -f tsconfig.json ]]; then
  echo "typecheck=tsconfig.json"
fi

# --- CI (first workflow only; full list lives in state.json separately) ----

if [[ -d .github/workflows ]]; then
  first_wf=$(ls -1 .github/workflows/*.yml .github/workflows/*.yaml 2>/dev/null | head -n 1 || true)
  if [[ -n "$first_wf" ]]; then
    echo "ci=$first_wf"
  fi
fi

exit 0
