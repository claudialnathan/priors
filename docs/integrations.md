# Integrations

Priors ships as a Claude Code plugin (preferred) and as an MCP server you can
wire into any MCP-aware client. This document covers both:

- **Claude Code plugin install** — the easiest path. Bundles slash commands,
  the `priors-steward` subagent, hooks, and the MCP server.
- **Manual MCP wiring** — for clients without plugin support (Cursor, Codex
  CLI, or any other MCP client).

The CLI command `priors init-config --client <name>` will print these same
snippets, parameterized with the absolute paths for your machine. Priors
deliberately does not edit client configs for you — paste the snippet and keep
ownership of your tool config.

---

## Prerequisites

- **Node.js 25 or later.** Priors imports `.ts` directly via Node's native
  type stripping. Older Node releases will fail at startup.
- **A project root with a `.priors/` store.** Run `priors init` once per
  repository to create the store. The MCP server resolves all paths relative
  to `--project-root`.
- **An absolute path to `bin/priors.js`.** Either install Priors globally
  (`npm install -g priors`) and use `priors`, or point the client at the path
  in your checkout (e.g. `/Users/me/repos/priors/bin/priors.js`).

Verify the server boots before configuring a client:

```bash
node /path/to/priors/bin/priors.js mcp --project-root "$PWD"
```

The process should idle on stdin. Send `Ctrl-D` (or `Ctrl-C`) to exit.

---

## Claude Code — plugin install (recommended)

The Priors repo ships its own single-plugin marketplace
(`.claude-plugin/marketplace.json`), so installation is two slash commands
from any Claude Code session:

```
/plugin marketplace add https://github.com/claudialnathan/priors
/plugin install priors@priors
```

Open a fresh chat in your project. The `SessionStart` hook creates `.priors/`
(if it does not exist) and loads a compact orientation brief. Try `/priors`
to see the status line.

### From a local clone (development)

```bash
git clone https://github.com/claudialnathan/priors.git
cd priors
npm install
npm test
```

Then point Claude Code at the local clone:

```
/plugin marketplace add /abs/path/to/clone
/plugin install priors@priors
```

The plugin scaffold lives at `<plugin-root>/.claude-plugin/plugin.json`,
`.claude-plugin/marketplace.json`, `skills/<name>/SKILL.md` (one per slash
command), `agents/`, `hooks/`, and `.mcp.json`. Auto-discovery wires
everything.

### What the plugin gives you

| Surface | Source |
| --- | --- |
| Slash commands (auto-namespaced as `/priors:<name>`): `/priors:status`, `/priors:brief`, `/priors:recall`, `/priors:why`, `/priors:impact`, `/priors:reflect`, `/priors:log`, `/priors:rules`, `/priors:rule-add`, `/priors:export` | `skills/<name>/SKILL.md` |
| `priors-steward` subagent (pushback, bounded staging) | `agents/priors-steward.md` |
| `SessionStart`, `UserPromptSubmit`, `PreCompact`, `Stop` hooks | `hooks/hooks.json` |
| MCP server (`priors://brief`, `recall`, `stage_learning`, …) | `.mcp.json` |

### Verify

Open a new chat in your project and ask:

> Read `priors://brief` and summarize the project trajectory in three lines.

If the brief loads, the plugin is wired up. Try `/priors` to see the status
line.

## Claude Code — MCP-only install

If you don't want the plugin (just the MCP tools):

```json
{
  "mcpServers": {
    "priors": {
      "command": "/usr/local/bin/node",
      "args": [
        "/abs/path/to/priors/bin/priors.js",
        "mcp",
        "--project-root",
        "/abs/path/to/your/project"
      ]
    }
  }
}
```

Paste into `.mcp.json` (workspace) or `~/.claude/settings.json` (per-user).
Use absolute paths.

---

## Cursor

Cursor doesn't have a plugin surface equivalent to Claude Code's plugin
system, but Priors ships two scaffolding files that get you most of the
behavior:

- `.cursor/rules/priors.mdc` — always-apply operating rule (pushback format,
  natural-language log intents, cost discipline). Cursor surfaces this in
  every chat for the workspace.
- `.cursor/mcp.json` — wires the MCP server.

After cloning Priors as a sibling project and adding it as an MCP server, copy
or symlink the `.cursor/rules/priors.mdc` file into your project's `.cursor/`
directory (Cursor only loads rules from the workspace, not from a separate
plugin).

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "priors": {
      "command": "/usr/local/bin/node",
      "args": [
        "/abs/path/to/priors/bin/priors.js",
        "mcp",
        "--project-root",
        "/abs/path/to/your/project"
      ]
    }
  }
}
```

Notes:

- Cursor enables MCP servers per-window. After saving the file, toggle the
  server on in Settings → MCP.
- The Cursor agent will list Priors tools (`recall`, `stage_learning`, etc.)
  alongside its built-in tools. Tools that return JSON are surfaced as
  `structuredContent` automatically.
- Slash commands aren't a Cursor primitive. Use natural language ("recall what
  we decided about X", "this is a rule: …") and the rule will route the
  intent through the right tool.

---

## Codex CLI

Codex CLI 0.4+ reads servers from `~/.codex/config.toml` under
`[mcp_servers.<name>]`.

```toml
[mcp_servers.priors]
command = "/usr/local/bin/node"
args = ["/abs/path/to/priors/bin/priors.js", "mcp", "--project-root", "/abs/path/to/your/project"]
```

Notes:

- Codex CLI launches each server with the user's environment. If you use
  `nvm` or `asdf`, point `command` at a stable Node binary
  (`process.execPath` works inside scripts; the CLI prints the resolved path).
- Server name (`priors` here) is what shows up in `/mcp` listings.

---

## Generic stdio invocation

If you write your own MCP client (or want to drive the server from a script),
the raw command line is:

```bash
/usr/local/bin/node /abs/path/to/priors/bin/priors.js mcp --project-root /abs/path/to/your/project
```

The protocol is line-delimited JSON-RPC 2.0. The first request must be
`initialize`. See `src/mcp/server.ts` for the full surface, or read the JSON
schemas at runtime via `tools/list` / `resources/list`.

---

## Per-project vs. per-machine

The MCP server binds to one project at start. If you work in multiple repos,
configure one server entry per repo (give them distinct names, e.g.
`priors-api` and `priors-app`). Avoid pointing two configs at the same
project root from the same client — the idempotency cache is per-process and
duplicate clients can produce duplicate audit entries when both retry the
same `client_request_id`.

A future release may expose multi-project servers; v1 deliberately does not.
The store is filesystem-scoped; one server, one project.

---

## Troubleshooting

| Symptom                          | Likely cause                                              | Fix                                                                  |
| -------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| Client reports `MCP server died` | Node version too old, or `bin/priors.js` not executable    | `node --version` ≥ 25; `chmod +x bin/priors.js` if launching directly |
| Tools list is empty              | Client did not finish `initialize`                        | Confirm the client supports MCP `2024-11-05`; reload the workspace   |
| `priors://brief` returns 404     | `.priors/` not initialized                                 | `priors init --project-root <root>`                                  |
| Recall returns nothing           | Index out of date                                          | `priors health --fix --project-root <root>`                          |
| Duplicate entries after retries  | Tool call missing `client_request_id`                      | Always set `client_request_id` for write tools                       |

---

## What clients can rely on

- **`priors://brief` is bounded.** Token ceiling is 2000 (~6 KB plain text).
  Safe to inline at session start.
- **Resources are read-only.** No tool reads from the network.
- **Writes are auditable.** Every write appends a JSON event to
  `.priors/audit/actions.log`. Use `priors://audit/{id}` to fetch the trail
  for a specific entry.
- **Idempotency keys.** All write tools accept `client_request_id`. The
  server caches the last 256 responses per process; identical retries return
  identical results.
- **No background work.** The server only acts on requests. There is no
  daemon, no scheduled distillation, no decay process.
