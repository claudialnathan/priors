#!/usr/bin/env bash
# SessionStart hook — cold-start orientation for the priors.
#
# Emits a short system-reminder pointing the agent at the priors's
# orientation files. Does NOT read the memory store itself (that's the
# agent's job, via memory.view) — just nudges it to do so.
#
# Exits 0 always. If the priors isn't initialized yet, the agent will
# notice when it tries to view HEAD.md and can prompt the user to run
# /priors-init.

set -euo pipefail

cat <<'EOF'
<priors-cold-start>
This project has a priors at /memories/priors/. Before doing anything
else, orient yourself:

1. memory.view /memories/priors/HEAD.md
2. memory.view /memories/priors/operator.yaml
3. memory.view /memories/priors/state.json

Do NOT read /memories/priors/entries/ unprompted — that's the long tail,
load it on demand via index.json.

If any of those three files doesn't exist, tell the user to run
/priors-init before proceeding with other work.
</priors-cold-start>
EOF

exit 0
