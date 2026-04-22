#!/usr/bin/env bash
# SessionStart hook — cold-start orientation for the playbook.
#
# Emits a short system-reminder pointing the agent at the playbook's
# orientation files. Does NOT read the memory store itself (that's the
# agent's job, via memory.view) — just nudges it to do so.
#
# Exits 0 always. If the playbook isn't initialized yet, the agent will
# notice when it tries to view HEAD.md and can prompt the user to run
# /playbook-init.

set -euo pipefail

cat <<'EOF'
<playbook-cold-start>
This project has a playbook at /memories/playbook/. Before doing anything
else, orient yourself:

1. memory.view /memories/playbook/HEAD.md
2. memory.view /memories/playbook/operator.yaml
3. memory.view /memories/playbook/state.json

Do NOT read /memories/playbook/entries/ unprompted — that's the long tail,
load it on demand via index.json.

If any of those three files doesn't exist, tell the user to run
/playbook-init before proceeding with other work.
</playbook-cold-start>
EOF

exit 0
