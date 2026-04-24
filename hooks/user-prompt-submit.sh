#!/usr/bin/env bash
# UserPromptSubmit hook — inject operator context on every prompt.
#
# Opt-in: the hook is always registered (plugins have no user-toggle
# mechanism), but it only emits output when the store contains a
# `.auto-on` flag file. Default: silent. Flip with /priors:auto-on and
# /priors:auto-off.
#
# Reads operator.yaml from the project-scoped priors store and emits a
# compact system-reminder block. Intentionally narrow — just the
# operator's project-scoped framing. Keeps the cached prefix stable.
#
# Consumes stdin (Claude Code passes a JSON payload we don't need to parse).

set -euo pipefail

cat > /dev/null || true

slug="$(pwd | sed 's|/|-|g')"
store="${HOME}/.claude/projects/${slug}/priors"
operator_file="${store}/operator.yaml"
flag_file="${store}/.auto-on"

# Silent unless user opted in via /priors:auto-on.
[[ -f "$flag_file"     ]] || exit 0
[[ -f "$operator_file" ]] || exit 0

as_of="$(awk '/^as_of:/ {print $2; exit}' "$operator_file" 2>/dev/null || echo "unknown")"
role="$(awk '/^role_in_project:/ {sub(/^role_in_project:[[:space:]]*/, ""); print; exit}' "$operator_file" 2>/dev/null || echo "")"

echo "<priors-operator as_of=\"$as_of\">"
if [[ -n "$role" ]]; then
  echo "Role on this project: $role"
fi

echo "Preferences (extract):"
awk '
  /^preferences:/ {in_prefs=1; next}
  /^[a-z_]+:/ {in_prefs=0}
  in_prefs && /^[[:space:]]+-/ {
    sub(/^[[:space:]]+-[[:space:]]*/, "- ")
    print
    count++
    if (count >= 5) exit
  }
' "$operator_file"

echo ""
echo "These are as-of records, not present-tense beliefs. Frame accordingly."
echo "</priors-operator>"

exit 0
