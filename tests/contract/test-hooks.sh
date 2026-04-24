#!/usr/bin/env bash
# Hook-script contract test.
#
# Codifies the silent-failure-hunter invariant for the two Phase 1 hooks:
#   - Every hook has `set -e*` (no swallowed errors).
#   - session-start.sh exits 0 and emits the cold-start reminder, pointing
#     at the store path (~/.claude/projects/<slug>/priors/) and the
#     /priors:init slash command.
#   - user-prompt-submit.sh exits 0 silently by default (no .auto-on flag),
#     emits a compact operator block when the flag IS present, and caps
#     preference injection at 5 bullets.
#
# Self-contained: no helpers, no venv, no external deps beyond bash + grep.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOKS_DIR="$REPO_ROOT/hooks"

pass=0
fail=0

_ok()   { echo "  [PASS] $1"; pass=$((pass + 1)); }
_fail() { echo "  [FAIL] $1"; [[ -n "${2:-}" ]] && echo "$2" | sed 's/^/    /'; fail=$((fail + 1)); }
_banner() { echo ""; echo "=== $1 ==="; }

assert_file_exists() {
  [[ -e "$1" ]] && _ok "$2" || _fail "$2" "  missing: $1"
}
assert_exit_0() {
  [[ "$1" -eq 0 ]] && _ok "$2" || _fail "$2" "  got exit code $1"
}
assert_eq() {
  [[ "$1" == "$2" ]] && _ok "$3" || _fail "$3" "  expected: $1$'\n'  actual:   $2"
}
assert_contains() {
  echo "$1" | grep -Fq -- "$2" && _ok "$3" || _fail "$3" "  missing substring: $2"
}
assert_has_errexit() {
  grep -Eq '^[[:space:]]*set[[:space:]]+-[^[:space:]]*e' "$1" \
    && _ok "$2" \
    || _fail "$2" "  no 'set -e*' line in $1"
}

# ---- plugin manifest ---------------------------------------------------------

_banner "plugin: manifest"

assert_file_exists "$REPO_ROOT/.claude-plugin/plugin.json" ".claude-plugin/plugin.json exists"
assert_file_exists "$REPO_ROOT/hooks/hooks.json"           "hooks/hooks.json exists"

manifest="$(cat "$REPO_ROOT/.claude-plugin/plugin.json")"
assert_contains "$manifest" '"name": "priors"' "manifest declares name: priors"
assert_contains "$manifest" '"version"'        "manifest declares a version"

hooks_json="$(cat "$REPO_ROOT/hooks/hooks.json")"
assert_contains "$hooks_json" '"SessionStart"'         "hooks.json registers SessionStart"
assert_contains "$hooks_json" '"UserPromptSubmit"'     "hooks.json registers UserPromptSubmit"
assert_contains "$hooks_json" 'CLAUDE_PLUGIN_ROOT'     "hooks.json uses \$CLAUDE_PLUGIN_ROOT for paths"

# ---- session-start.sh --------------------------------------------------------

_banner "hook: session-start.sh"

assert_file_exists "$HOOKS_DIR/session-start.sh" "file exists"
assert_has_errexit "$HOOKS_DIR/session-start.sh" "uses set -e (no silent failures)"

out=$(echo '{}' | bash "$HOOKS_DIR/session-start.sh" 2>&1)
rc=$?
assert_exit_0 "$rc" "exits 0 on success"
assert_contains "$out" "<priors-cold-start>"  "emits cold-start reminder tag"
assert_contains "$out" ".claude/projects/"    "resolves store path (~/.claude/projects/<slug>/priors/)"
assert_contains "$out" "/priors"              "path ends in /priors (no /memory/memories/)"
assert_contains "$out" "HEAD.md"              "points agent at HEAD.md"
assert_contains "$out" "operator.yaml"        "points agent at operator.yaml"
assert_contains "$out" "state.json"           "points agent at state.json"
assert_contains "$out" "Read "                "tells agent to use native Read (not memory.view)"
assert_contains "$out" "/priors:init"         "tells agent the plugin-namespaced init command"
# Regression guards — the legacy shapes must stay dead.
echo "$out" | grep -Fq "memory.view"  && _fail "no memory.view language"  "  (legacy SDK tool)"  || _ok "no memory.view language"
echo "$out" | grep -Fq "/memories/"   && _fail "no /memories/ path"       "  (legacy SDK path)"  || _ok "no /memories/ path"
echo "$out" | grep -Fq "/priors-init" && _fail "no legacy /priors-init"   "  (standalone-config slash name)" || _ok "no legacy /priors-init slash name"

# ---- user-prompt-submit.sh: flag absent (default) ---------------------------

_banner "hook: user-prompt-submit.sh (default — no .auto-on flag)"

assert_file_exists "$HOOKS_DIR/user-prompt-submit.sh" "file exists"
assert_has_errexit "$HOOKS_DIR/user-prompt-submit.sh" "uses set -e (no silent failures)"

tmp_home="$(mktemp -d -t priors-hook-test.XXXXXX)"
slug="$(pwd | sed 's|/|-|g')"
store_dir="$tmp_home/.claude/projects/$slug/priors"
mkdir -p "$store_dir"
# operator.yaml exists, but .auto-on flag does not — hook must stay silent
cat > "$store_dir/operator.yaml" <<'EOF'
as_of: 2026-04-24
role_in_project: Sole maintainer
preferences:
  - Terse responses
EOF

out=$(HOME="$tmp_home" bash "$HOOKS_DIR/user-prompt-submit.sh" < /dev/null 2>&1)
rc=$?

assert_exit_0 "$rc" "exits 0 when .auto-on flag is absent"
assert_eq "" "$out" "emits nothing when .auto-on flag is absent (default silent)"

# ---- user-prompt-submit.sh: flag present, operator present -----------------

_banner "hook: user-prompt-submit.sh (flag on, operator present)"

# Add the full operator fixture + flip the flag.
cat > "$store_dir/operator.yaml" <<'EOF'
as_of: 2026-04-24
role_in_project: Sole maintainer
how_they_think:
  - Product-minded
  - Treats wording as intent
preferences:
  - Terse responses
  - Push back when framing is wrong
  - No trailing summaries
  - Prefer gold-standard idiomatic approach
  - Rate-limit sensitive; batch tool calls
  - (sixth — should be dropped; hook caps at 5)
strengths: [product thinking]
epistemic_note: >
  As-of records, not timeless beliefs.
EOF
touch "$store_dir/.auto-on"

out=$(HOME="$tmp_home" bash "$HOOKS_DIR/user-prompt-submit.sh" < /dev/null 2>&1)
rc=$?
rm -rf "$tmp_home"

assert_exit_0 "$rc" "exits 0 when .auto-on flag is present"
assert_contains "$out" "<priors-operator"      "emits operator block open tag"
assert_contains "$out" "as_of=\"2026-04-24\""  "carries as_of attribute"
assert_contains "$out" "Sole maintainer"       "includes role_in_project"
assert_contains "$out" "Terse responses"       "includes first preference"
assert_contains "$out" "</priors-operator>"    "closes operator block"

pref_count=$(echo "$out" | grep -c '^- ')
if [[ "$pref_count" -le 5 ]]; then
  _ok "preferences capped at 5 ($pref_count)"
else
  _fail "preferences not capped — got $pref_count (hook should stop at 5)"
fi

# ---- summary ----------------------------------------------------------------

echo ""
total=$((pass + fail))
if [[ "$fail" -eq 0 ]]; then
  echo "test-hooks: $pass/$total passed"
  exit 0
else
  echo "test-hooks: $fail of $total FAILED"
  exit 1
fi
