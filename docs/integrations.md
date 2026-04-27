# Integrations

Priors is a stdio Model Context Protocol (MCP) server. Any MCP-aware client
can run it. This document collects ready-to-paste configuration snippets for
the three clients we test against: **Claude Code**, **Cursor**, and the
**Codex CLI**.

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

## Claude Code

Claude Code reads MCP servers from a workspace `.mcp.json` (preferred for
per-repo setup) or from `~/.claude/settings.json` (per-user). Both files
accept the same shape.

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

- Use absolute paths. Claude Code launches the process from its own working
  directory, not yours.
- The server logs nothing to stdout (stdout is reserved for JSON-RPC). Use
  `priors health --project-root <root>` from a terminal if Claude Code
  reports a connection failure.
- After editing `.mcp.json`, reload the workspace.

To verify Priors is wired up, ask the agent:

> Read `priors://brief` and summarize the project trajectory in three lines.

If the brief loads, the integration works. The first thing every Priors-aware
agent should do in a session is read this resource.

---

## Cursor

Cursor stores MCP servers in `.cursor/mcp.json` at the workspace root.

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
