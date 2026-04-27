import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { runMcpServer } from "../../src/mcp/server.ts";
import { withTempStore, seedEntry } from "../helpers/temp-store.ts";

interface RpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

class McpClient {
  private input = new PassThrough();
  private output = new PassThrough();
  private serverDone: Promise<void>;
  private buffer = "";
  private pending = new Map<
    number,
    { resolve: (r: RpcResponse) => void; reject: (e: Error) => void }
  >();
  private nextId = 1;

  constructor(projectRoot: string) {
    this.output.setEncoding("utf8");
    this.output.on("data", (chunk: string) => {
      this.buffer += chunk;
      let nl: number;
      while ((nl = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, nl).trim();
        this.buffer = this.buffer.slice(nl + 1);
        if (line.length === 0) continue;
        const msg = JSON.parse(line) as RpcResponse;
        const id = typeof msg.id === "number" ? msg.id : null;
        if (id !== null && this.pending.has(id)) {
          const pending = this.pending.get(id)!;
          this.pending.delete(id);
          pending.resolve(msg);
        }
      }
    });
    this.serverDone = runMcpServer({
      projectRoot,
      input: this.input,
      output: this.output,
    });
  }

  request(method: string, params?: unknown): Promise<RpcResponse> {
    const id = this.nextId++;
    const promise = new Promise<RpcResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.input.write(
      JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
    );
    return promise;
  }

  notify(method: string, params?: unknown): void {
    this.input.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  async close(): Promise<void> {
    this.input.end();
    await this.serverDone;
  }
}

test("initialize returns protocol version, server info, and capabilities", async () => {
  await withTempStore(async (root) => {
    const client = new McpClient(root);
    try {
      const res = await client.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "0.0.0" },
      });
      assert.equal(res.error, undefined);
      const result = res.result as {
        protocolVersion: string;
        serverInfo: { name: string };
        capabilities: { tools: unknown };
      };
      assert.equal(result.protocolVersion, "2024-11-05");
      assert.equal(result.serverInfo.name, "priors");
      assert.ok(result.capabilities.tools);
    } finally {
      await client.close();
    }
  });
});

test("tools/list returns the v1 tools with input schemas", async () => {
  await withTempStore(async (root) => {
    const client = new McpClient(root);
    try {
      const res = await client.request("tools/list");
      const result = res.result as { tools: Array<{ name: string; inputSchema: unknown }> };
      const names = result.tools.map((t) => t.name).sort();
      assert.deepEqual(names, [
        "commit_edge",
        "commit_learning",
        "discard_edge",
        "discard_staged",
        "edit_staged",
        "get_entry",
        "link_entries",
        "mark_stale",
        "propose_edge",
        "recall",
        "stage_learning",
      ]);
      for (const tool of result.tools) {
        assert.ok(tool.inputSchema, `${tool.name} has inputSchema`);
      }
    } finally {
      await client.close();
    }
  });
});

test("resources/list and resources/templates/list expose the v1 surface", async () => {
  await withTempStore(async (root) => {
    const client = new McpClient(root);
    try {
      const list = await client.request("resources/list");
      const listed = (list.result as { resources: Array<{ uri: string }> }).resources;
      const uris = listed.map((r) => r.uri).sort();
      assert.deepEqual(uris, ["priors://brief", "priors://index"]);

      const templates = await client.request("resources/templates/list");
      const tmpl = (templates.result as {
        resourceTemplates: Array<{ uriTemplate: string }>;
      }).resourceTemplates;
      const t = tmpl.map((r) => r.uriTemplate).sort();
      assert.deepEqual(t, ["priors://audit/{id}", "priors://entry/{id}"]);
    } finally {
      await client.close();
    }
  });
});

test("resources/read serves the brief and an entry by id", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-mcp-1",
      kind: "decision",
      claim: "Read brief first when joining a project.",
    });
    const client = new McpClient(root);
    try {
      const brief = await client.request("resources/read", {
        uri: "priors://brief",
      });
      const briefContents = (brief.result as { contents: Array<{ text: string }> })
        .contents[0]!;
      assert.match(briefContents.text, /# Project trajectory brief/);
      assert.match(briefContents.text, /Read brief first/);

      const entry = await client.request("resources/read", {
        uri: "priors://entry/pri-mcp-1",
      });
      const entryText = (entry.result as { contents: Array<{ text: string }> })
        .contents[0]!.text;
      assert.match(entryText, /id: pri-mcp-1/);
    } finally {
      await client.close();
    }
  });
});

test("resources/read on an unknown entry id returns an INVALID_PARAMS error", async () => {
  await withTempStore(async (root) => {
    const client = new McpClient(root);
    try {
      const res = await client.request("resources/read", {
        uri: "priors://entry/pri-missing",
      });
      assert.ok(res.error, "expected error response");
      assert.equal(res.error?.code, -32602);
      assert.match(res.error!.message, /entry not found/);
    } finally {
      await client.close();
    }
  });
});

test("tools/call mark_stale is idempotent under the same client_request_id", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-stale-1",
      kind: "decision",
      claim: "Use Node 25 native type stripping.",
    });
    const client = new McpClient(root);
    try {
      const first = await client.request("tools/call", {
        name: "mark_stale",
        arguments: {
          id: "pri-stale-1",
          reason: "no longer relevant",
          client_request_id: "req-1",
        },
      });
      const second = await client.request("tools/call", {
        name: "mark_stale",
        arguments: {
          id: "pri-stale-1",
          reason: "no longer relevant",
          client_request_id: "req-1",
        },
      });
      assert.equal(first.error, undefined);
      assert.equal(second.error, undefined);
      assert.deepEqual(
        (first.result as { structuredContent: unknown }).structuredContent,
        (second.result as { structuredContent: unknown }).structuredContent,
      );
    } finally {
      await client.close();
    }
  });
});

test("tools/call recall returns matching entries", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-recall-1",
      kind: "decision",
      claim: "Pick TypeScript on Node 25 for zero deps.",
    });
    await seedEntry(root, clock, {
      id: "pri-recall-2",
      kind: "constraint",
      claim: "Never edit .priors/ files directly.",
    });
    const client = new McpClient(root);
    try {
      const res = await client.request("tools/call", {
        name: "recall",
        arguments: { query: "TypeScript" },
      });
      assert.equal(res.error, undefined);
      const structured = (res.result as {
        structuredContent: { hits: Array<{ id: string }>; total: number };
      }).structuredContent;
      assert.ok(structured.hits.some((r) => r.id === "pri-recall-1"));
    } finally {
      await client.close();
    }
  });
});

test("tools/call rejects unknown tools with METHOD_NOT_FOUND", async () => {
  await withTempStore(async (root) => {
    const client = new McpClient(root);
    try {
      const res = await client.request("tools/call", {
        name: "does_not_exist",
        arguments: {},
      });
      assert.ok(res.error);
      assert.equal(res.error?.code, -32601);
    } finally {
      await client.close();
    }
  });
});

test("unknown JSON-RPC methods return METHOD_NOT_FOUND", async () => {
  await withTempStore(async (root) => {
    const client = new McpClient(root);
    try {
      const res = await client.request("nonexistent/method");
      assert.ok(res.error);
      assert.equal(res.error?.code, -32601);
    } finally {
      await client.close();
    }
  });
});

test("notifications/initialized is accepted with no response", async () => {
  await withTempStore(async (root) => {
    const client = new McpClient(root);
    try {
      client.notify("notifications/initialized");
      const ping = await client.request("ping");
      assert.equal(ping.error, undefined);
    } finally {
      await client.close();
    }
  });
});
