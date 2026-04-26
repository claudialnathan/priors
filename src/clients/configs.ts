import path from "node:path";
import process from "node:process";

export type SupportedClient = "claude" | "cursor" | "codex" | "raw";

export const SUPPORTED_CLIENTS: SupportedClient[] = [
  "claude",
  "cursor",
  "codex",
  "raw",
];

export interface ConfigOptions {
  client: SupportedClient;
  /** Absolute path to the project root that the server should bind to. */
  projectRoot: string;
  /** Absolute path to the `priors` executable (`bin/priors.js`). */
  priorsBin: string;
  /** Absolute path to the Node binary that should run the script. */
  nodeBin?: string;
  /** Server name to show in the client UI. */
  serverName?: string;
}

/**
 * Build a string suitable for pasting into a client's MCP config.
 *
 * v1 deliberately does not write any client config files automatically. The
 * `priors init-config` command prints a snippet to stdout; the user pastes it.
 * This keeps the install path auditable and lets the user keep ownership of
 * their client configuration.
 */
export function renderClientConfig(opts: ConfigOptions): string {
  const node = opts.nodeBin ?? "node";
  const serverName = opts.serverName ?? "priors";
  const args = [opts.priorsBin, "mcp", "--project-root", opts.projectRoot];

  switch (opts.client) {
    case "claude":
      return renderJsonBlock(
        "Claude Code (.claude/settings.json or workspace .mcp.json)",
        {
          mcpServers: {
            [serverName]: {
              command: node,
              args,
            },
          },
        },
      );
    case "cursor":
      return renderJsonBlock("Cursor (.cursor/mcp.json)", {
        mcpServers: {
          [serverName]: {
            command: node,
            args,
          },
        },
      });
    case "codex":
      return renderTomlBlock("Codex CLI (~/.codex/config.toml)", {
        sectionName: `mcp_servers.${serverName}`,
        command: node,
        args,
      });
    case "raw":
      return [
        "# Raw stdio MCP server invocation:",
        `${shellQuote(node)} ${args.map(shellQuote).join(" ")}`,
      ].join("\n");
  }
}

function renderJsonBlock(label: string, doc: unknown): string {
  return [
    `# ${label}`,
    "# Paste the following block under your existing config (merge keys, do not overwrite).",
    JSON.stringify(doc, null, 2),
  ].join("\n");
}

function renderTomlBlock(
  label: string,
  spec: { sectionName: string; command: string; args: string[] },
): string {
  const lines = [
    `# ${label}`,
    "# Append this block to your config.toml (Codex CLI 0.4+).",
    `[${spec.sectionName}]`,
    `command = ${JSON.stringify(spec.command)}`,
    `args = [${spec.args.map((a) => JSON.stringify(a)).join(", ")}]`,
  ];
  return lines.join("\n");
}

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_./-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Resolve the absolute path of the `priors` bin script when invoked from this
 * package. Falls back to the npm-installed name if no fileURL is provided.
 */
export function defaultPriorsBin(): string {
  const argv1 = process.argv[1];
  if (argv1 && path.isAbsolute(argv1)) return argv1;
  return "priors";
}

export function defaultNodeBin(): string {
  return process.execPath;
}
