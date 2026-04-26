import { test } from "node:test";
import assert from "node:assert/strict";
import { renderClientConfig, SUPPORTED_CLIENTS } from "../../src/clients/configs.ts";

const FIXTURE = {
  projectRoot: "/Users/example/repos/demo",
  priorsBin: "/Users/example/.priors/bin/priors.js",
  nodeBin: "/usr/local/bin/node",
};

test("SUPPORTED_CLIENTS includes the v1 set", () => {
  assert.deepEqual([...SUPPORTED_CLIENTS].sort(), [
    "claude",
    "codex",
    "cursor",
    "raw",
  ]);
});

test("claude config emits a JSON block with mcpServers/priors", () => {
  const out = renderClientConfig({ client: "claude", ...FIXTURE });
  assert.match(out, /Claude Code/);
  const jsonStart = out.indexOf("{");
  const parsed = JSON.parse(out.slice(jsonStart));
  assert.deepEqual(parsed, {
    mcpServers: {
      priors: {
        command: "/usr/local/bin/node",
        args: [
          FIXTURE.priorsBin,
          "mcp",
          "--project-root",
          FIXTURE.projectRoot,
        ],
      },
    },
  });
});

test("cursor config emits a JSON block with mcpServers/priors", () => {
  const out = renderClientConfig({ client: "cursor", ...FIXTURE });
  assert.match(out, /Cursor/);
  const jsonStart = out.indexOf("{");
  const parsed = JSON.parse(out.slice(jsonStart));
  assert.equal(parsed.mcpServers.priors.command, "/usr/local/bin/node");
  assert.deepEqual(parsed.mcpServers.priors.args, [
    FIXTURE.priorsBin,
    "mcp",
    "--project-root",
    FIXTURE.projectRoot,
  ]);
});

test("codex config emits a TOML mcp_servers section", () => {
  const out = renderClientConfig({ client: "codex", ...FIXTURE });
  assert.match(out, /Codex CLI/);
  assert.match(out, /\[mcp_servers\.priors\]/);
  assert.match(out, /command = "\/usr\/local\/bin\/node"/);
  assert.match(
    out,
    /args = \["[^"]*", "mcp", "--project-root", "[^"]*"\]/,
  );
});

test("raw config emits a runnable shell invocation", () => {
  const out = renderClientConfig({ client: "raw", ...FIXTURE });
  assert.match(out, /Raw stdio MCP server invocation/);
  assert.match(
    out,
    new RegExp(`${FIXTURE.nodeBin} ${FIXTURE.priorsBin} mcp --project-root ${FIXTURE.projectRoot}`),
  );
});

test("paths with spaces are shell-quoted in raw output", () => {
  const out = renderClientConfig({
    client: "raw",
    projectRoot: "/Users/With Space/proj",
    priorsBin: "/usr/local/bin/priors.js",
    nodeBin: "/usr/bin/node",
  });
  assert.match(out, /'\/Users\/With Space\/proj'/);
});

test("custom server name is honored", () => {
  const out = renderClientConfig({
    client: "claude",
    serverName: "priors-demo",
    ...FIXTURE,
  });
  assert.match(out, /"priors-demo":/);
});
