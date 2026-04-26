import type { Readable, Writable } from "node:stream";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess<T = unknown> {
  jsonrpc: "2.0";
  id: number | string | null;
  result: T;
}

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: number | string | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

export const ERR = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
} as const;

export type Handler = (
  method: string,
  params: unknown,
) => Promise<unknown>;

export function jsonRpcError(
  id: number | string | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError {
  const err: JsonRpcError = {
    jsonrpc: "2.0",
    id,
    error: { code, message },
  };
  if (data !== undefined) err.error.data = data;
  return err;
}

export function jsonRpcSuccess<T>(
  id: number | string | null,
  result: T,
): JsonRpcSuccess<T> {
  return { jsonrpc: "2.0", id, result };
}

/**
 * Run a line-delimited JSON-RPC server reading from `input` and writing to
 * `output`. Each request is a single line of JSON. Notifications (no `id`)
 * receive no response.
 */
export async function serveJsonRpc(
  input: Readable,
  output: Writable,
  handle: Handler,
): Promise<void> {
  let buffer = "";
  const pending = new Set<Promise<void>>();
  let inputEnded = false;
  return new Promise((resolve, reject) => {
    input.setEncoding("utf8");
    input.on("data", (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line.length === 0) continue;
        const p = processLine(line, handle, output).catch(() => undefined);
        pending.add(p);
        p.finally(() => {
          pending.delete(p);
          if (inputEnded && pending.size === 0) resolve();
        });
      }
    });
    input.on("end", () => {
      inputEnded = true;
      if (pending.size === 0) resolve();
    });
    input.on("error", (err) => reject(err));
  });
}

async function processLine(
  line: string,
  handle: Handler,
  output: Writable,
): Promise<void> {
  let req: JsonRpcRequest;
  try {
    req = JSON.parse(line) as JsonRpcRequest;
  } catch {
    output.write(
      JSON.stringify(jsonRpcError(null, ERR.PARSE, "Parse error")) + "\n",
    );
    return;
  }
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string") {
    output.write(
      JSON.stringify(
        jsonRpcError(
          (req as { id?: number | string | null }).id ?? null,
          ERR.INVALID_REQUEST,
          "Invalid Request",
        ),
      ) + "\n",
    );
    return;
  }
  const isNotification = !("id" in req) || req.id === undefined;
  try {
    const result = await handle(req.method, req.params);
    if (isNotification) return;
    output.write(JSON.stringify(jsonRpcSuccess(req.id ?? null, result)) + "\n");
  } catch (err) {
    if (isNotification) return;
    const e = err as Error & { code?: number; data?: unknown };
    const code = typeof e.code === "number" ? e.code : ERR.INTERNAL;
    output.write(
      JSON.stringify(
        jsonRpcError(req.id ?? null, code, e.message ?? "internal error", e.data),
      ) + "\n",
    );
  }
}

export class RpcError extends Error {
  code: number;
  data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    if (data !== undefined) this.data = data;
  }
}
