import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import {
  ERR,
  RpcError,
  jsonRpcError,
  jsonRpcSuccess,
  serveJsonRpc,
} from "../../../src/util/json-rpc.ts";

interface Driver {
  responses: Array<Record<string, unknown>>;
}

async function drive(
  requests: Array<Record<string, unknown> | string>,
  handle: (method: string, params: unknown) => Promise<unknown>,
): Promise<Driver> {
  const lines = requests
    .map((r) => (typeof r === "string" ? r : JSON.stringify(r)))
    .join("\n") + "\n";
  const input = Readable.from([lines]);
  const chunks: string[] = [];
  const output = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
      cb();
    },
  });
  await serveJsonRpc(input, output, handle);
  const text = chunks.join("");
  const responses = text
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
  return { responses };
}

test("serveJsonRpc routes a request to the handler and writes a success response", async () => {
  const { responses } = await drive(
    [{ jsonrpc: "2.0", id: 1, method: "echo", params: { msg: "hi" } }],
    async (method, params) => {
      assert.equal(method, "echo");
      return params;
    },
  );
  assert.equal(responses.length, 1);
  assert.equal(responses[0]?.["id"], 1);
  assert.deepEqual(
    (responses[0] as { result: unknown }).result,
    { msg: "hi" },
  );
});

test("serveJsonRpc converts thrown RpcError into a JSON-RPC error", async () => {
  const { responses } = await drive(
    [{ jsonrpc: "2.0", id: 2, method: "boom" }],
    async () => {
      throw new RpcError(ERR.INVALID_PARAMS, "bad input", { foo: "bar" });
    },
  );
  assert.equal(responses.length, 1);
  const err = (responses[0] as { error: { code: number; message: string; data: unknown } }).error;
  assert.equal(err.code, ERR.INVALID_PARAMS);
  assert.equal(err.message, "bad input");
  assert.deepEqual(err.data, { foo: "bar" });
});

test("serveJsonRpc reports a parse error for invalid JSON", async () => {
  const { responses } = await drive(
    ["not json {"],
    async () => null,
  );
  const err = (responses[0] as { error: { code: number } }).error;
  assert.equal(err.code, ERR.PARSE);
});

test("serveJsonRpc rejects an invalid request shape", async () => {
  const { responses } = await drive(
    [{ id: 5, method: 123 } as unknown as Record<string, unknown>],
    async () => null,
  );
  const err = (responses[0] as { error: { code: number } }).error;
  assert.equal(err.code, ERR.INVALID_REQUEST);
});

test("serveJsonRpc swallows handler errors when the request is a notification", async () => {
  const { responses } = await drive(
    [{ jsonrpc: "2.0", method: "fire-and-forget" }],
    async () => {
      throw new Error("ignored");
    },
  );
  assert.equal(responses.length, 0);
});

test("serveJsonRpc waits for all pending handlers before resolving", async () => {
  const seen: number[] = [];
  const { responses } = await drive(
    [
      { jsonrpc: "2.0", id: 1, method: "slow" },
      { jsonrpc: "2.0", id: 2, method: "slow" },
      { jsonrpc: "2.0", id: 3, method: "slow" },
    ],
    async (_method, params) => {
      const id = (params as { id: number } | undefined)?.id ?? 0;
      await new Promise((r) => setTimeout(r, 5));
      seen.push(id);
      return { ok: true };
    },
  );
  assert.equal(responses.length, 3);
  for (const r of responses) {
    assert.deepEqual((r as { result: unknown }).result, { ok: true });
  }
});

test("jsonRpcSuccess and jsonRpcError shape responses", () => {
  const ok = jsonRpcSuccess(1, { x: 1 });
  assert.deepEqual(ok, { jsonrpc: "2.0", id: 1, result: { x: 1 } });
  const err = jsonRpcError(null, ERR.METHOD_NOT_FOUND, "no", { y: 2 });
  assert.deepEqual(err, {
    jsonrpc: "2.0",
    id: null,
    error: { code: ERR.METHOD_NOT_FOUND, message: "no", data: { y: 2 } },
  });
});
