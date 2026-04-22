#!/usr/bin/env bash
# UserPromptSubmit hook — inject operator context on every prompt.
#
# Reads operator.yaml from the memory store (via the filesystem path the
# memory_20250818 backend writes to) and emits a compact system-reminder
# block. Intentionally narrow — just the operator's project-scoped
# framing, not the full file. Keeps the cached prefix stable.
#
# If operator.yaml doesn't exist, exits silently (no injection).
# The agent will notice via the SessionStart hook and prompt init.
#
# Reads hook input from stdin (Claude Code passes a JSON payload) but
# doesn't need to parse it for this hook — we only emit context.

set -euo pipefail

# Consume stdin so Claude Code doesn't block.
cat > /dev/null || true

# Resolve the memory backend directory. The memory_20250818 tool is
# client-side; by convention the backend mirrors /memories/... to a
# local path. Project-scoped memory for Claude Code lives at:
#   ~/.claude/projects/<slug>/memory/
# where <slug> is the cwd-encoded project directory.
#
# For the playbook we're reading operator.yaml if the backend has
# persisted it there. If the path resolution changes upstream, this
# script is the single place to update.

project_slug="$(pwd | sed 's|/|-|g')"
mem_root="${HOME}/.claude/projects/${project_slug}/memory"
operator_file="${mem_root}/memories/playbook/operator.yaml"

if [[ ! -f "$operator_file" ]]; then
  # No operator context yet — exit silently. Don't nag on every prompt.
  exit 0
fi

# Pull the operator summary. Keep injection small — we want the cached
# prefix stable and the prompt lean. Extract `as_of`, `role_in_project`,
# and up to five preference bullets.

as_of="$(awk '/^as_of:/ {print $2; exit}' "$operator_file" 2>/dev/null || echo "unknown")"
role="$(awk '/^role_in_project:/ {sub(/^role_in_project:[[:space:]]*/, ""); print; exit}' "$operator_file" 2>/dev/null || echo "")"

echo "<playbook-operator as_of=\"$as_of\">"
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
echo "</playbook-operator>"

exit 0
