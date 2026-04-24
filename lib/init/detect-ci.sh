#!/usr/bin/env bash
# detect-ci.sh — CI provider + test-framework signals.
#
# Contract mirrors detect-stack.sh: KEY=VALUE lines, silent when nothing
# detected, exit 0 always.
#
# Keys: ci_present, ci_provider, ci_source, test_framework,
#       test_framework_source, e2e_framework, e2e_framework_source.

set -uo pipefail

# --- CI provider ------------------------------------------------------------

if [[ -d .github/workflows ]]; then
  first_wf=$(ls -1 .github/workflows/*.yml .github/workflows/*.yaml 2>/dev/null | head -n 1 || true)
  if [[ -n "$first_wf" ]]; then
    echo "ci_present=true"
    echo "ci_provider=github-actions"
    echo "ci_source=$first_wf"
  fi
elif [[ -f .gitlab-ci.yml ]]; then
  echo "ci_present=true"
  echo "ci_provider=gitlab-ci"
  echo "ci_source=.gitlab-ci.yml"
elif [[ -f .circleci/config.yml ]]; then
  echo "ci_present=true"
  echo "ci_provider=circleci"
  echo "ci_source=.circleci/config.yml"
fi

# --- test framework (first match wins) -------------------------------------

found_test=""
for f in vitest.config.ts vitest.config.js vitest.config.mjs; do
  if [[ -f "$f" ]]; then
    echo "test_framework=vitest"
    echo "test_framework_source=$f"
    found_test=1
    break
  fi
done

if [[ -z "$found_test" ]]; then
  for f in jest.config.ts jest.config.js jest.config.mjs jest.config.cjs; do
    if [[ -f "$f" ]]; then
      echo "test_framework=jest"
      echo "test_framework_source=$f"
      found_test=1
      break
    fi
  done
fi

if [[ -z "$found_test" ]]; then
  if [[ -f pytest.ini ]]; then
    echo "test_framework=pytest"
    echo "test_framework_source=pytest.ini"
  elif [[ -f pyproject.toml ]] && grep -q '\[tool.pytest' pyproject.toml 2>/dev/null; then
    echo "test_framework=pytest"
    echo "test_framework_source=pyproject.toml"
  fi
fi

# --- e2e --------------------------------------------------------------------

for f in playwright.config.ts playwright.config.js; do
  if [[ -f "$f" ]]; then
    echo "e2e_framework=playwright"
    echo "e2e_framework_source=$f"
    break
  fi
done

for f in cypress.config.ts cypress.config.js; do
  if [[ -f "$f" ]]; then
    echo "e2e_framework=cypress"
    echo "e2e_framework_source=$f"
    break
  fi
done

exit 0
