#!/usr/bin/env bash
# SessionStart hook — cold-start orientation for the priors store.
#
# Computes the project-scoped store path and tells the agent to Read the
# three orientation files. Does NOT read them itself — just nudges.
#
# Exits 0 always. If the store isn't initialized yet, the agent will notice
# when Read fails and can prompt the user to run /priors:init.

set -euo pipefail

# Consume stdin (Claude Code passes a JSON payload we don't need here).
cat > /dev/null || true

# Project-scoped store path. Mirrors Claude Code's own per-project layout
# under ~/.claude/projects/<slug>/ (alongside session logs + auto-memory).
slug="$(pwd | sed 's|/|-|g')"
store="${HOME}/.claude/projects/${slug}/priors"

cat <<EOF
<priors-cold-start>
This project has a Priors store at ${store}/. Before doing anything else,
orient yourself:

1. Read ${store}/HEAD.md
2. Read ${store}/operator.yaml
3. Read ${store}/state.json

Do NOT read ${store}/entries/ unprompted — that's the long tail.
Load it on demand via ${store}/index.json.

If any of those three files doesn't exist, tell the user to run
/priors:init before proceeding with other work.
</priors-cold-start>
EOF

exit 0
