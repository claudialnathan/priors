import fs from "node:fs/promises";
import path from "node:path";
import {
  ERR,
  RpcError,
  serveJsonRpc,
  type Handler,
} from "../util/json-rpc.ts";
import { PROMPT_DEFS, RESOURCE_URIS, TOOL_SCHEMAS } from "../schema/mcp.ts";
import { recall as runRecall } from "../recall/recall.ts";
import {
  commitLearning,
  stageLearning,
  validateCommitInput,
  validateStageInput,
} from "../distill/stage.ts";
import {
  linkEntries,
  markStale,
  validateLinkInput,
  validateMarkStaleInput,
} from "../curation/curation.ts";
import { assembleBrief } from "../brief/assemble.ts";
import { regenerateIndex, type IndexDocument } from "../store/index.ts";
import {
  findEntryById,
  readStagedEntry,
  listEntries,
  entryToFileText,
} from "../store/entries.ts";
import { isSafeId } from "../util/safe-path.ts";
import { readAuditForEntry } from "../store/audit-query.ts";
import { renderSystemAndUser } from "../distill/prompt.ts";
import { requireProject } from "../store/project.ts";
import { indexAllPath } from "../store/paths.ts";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "priors";
const SERVER_VERSION = "1.0.0-rc.0";
const IDEMPOTENCY_CACHE_LIMIT = 256;

interface CachedResponse {
  result: unknown;
  ts: number;
}

interface ServerContext {
  projectRoot: string;
  idempotencyCache: Map<string, CachedResponse>;
}

interface CallToolResponse {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: unknown;
  isError?: boolean;
}

interface ResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

const TOOL_NAMES = Object.keys(TOOL_SCHEMAS) as Array<keyof typeof TOOL_SCHEMAS>;

export interface RunMcpServerOptions {
  projectRoot: string;
  /** stdin/stdout streams; default: process.stdin/process.stdout. */
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

/**
 * Start a stdio MCP server bound to `projectRoot`. Resolves when the input
 * stream closes.
 */
export async function runMcpServer(
  opts: RunMcpServerOptions,
): Promise<void> {
  const ctx: ServerContext = {
    projectRoot: path.resolve(opts.projectRoot),
    idempotencyCache: new Map(),
  };
  const handler = makeHandler(ctx);
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  await serveJsonRpc(input as never, output as never, handler);
}

function makeHandler(ctx: ServerContext): Handler {
  return async (method, params) => {
    switch (method) {
      case "initialize":
        return handleInitialize(params);
      case "initialized":
      case "notifications/initialized":
        return null;
      case "ping":
        return {};
      case "shutdown":
        return null;
      case "tools/list":
        return { tools: listTools() };
      case "tools/call":
        return handleToolCall(ctx, params);
      case "resources/list":
        return { resources: listResources() };
      case "resources/templates/list":
        return { resourceTemplates: listResourceTemplates() };
      case "resources/read":
        return handleResourceRead(ctx, params);
      case "prompts/list":
        return { prompts: listPrompts() };
      case "prompts/get":
        return handlePromptGet(ctx, params);
      default:
        throw new RpcError(ERR.METHOD_NOT_FOUND, `unknown method: ${method}`);
    }
  };
}

function handleInitialize(params: unknown): unknown {
  const clientProtocol =
    params && typeof params === "object" && !Array.isArray(params)
      ? (params as Record<string, unknown>)["protocolVersion"]
      : undefined;
  return {
    protocolVersion:
      typeof clientProtocol === "string" ? clientProtocol : PROTOCOL_VERSION,
    capabilities: {
      tools: { listChanged: false },
      resources: { listChanged: false, subscribe: false },
      prompts: { listChanged: false },
      logging: {},
    },
    serverInfo: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    instructions:
      "Read priors://brief first. Use recall(query, filters) for keyword search. Use stage_learning to propose lessons; the user must commit them.",
  };
}

function listTools(): Array<{
  name: string;
  description: string;
  inputSchema: unknown;
}> {
  return TOOL_NAMES.map((name) => ({
    name,
    description: TOOL_SCHEMAS[name].description,
    inputSchema: TOOL_SCHEMAS[name].inputSchema,
  }));
}

function listResources(): Array<{
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}> {
  return [
    {
      uri: RESOURCE_URIS.brief,
      name: "Project brief",
      description:
        "Deterministic orientation document for this project. Read this first.",
      mimeType: "text/markdown",
    },
    {
      uri: RESOURCE_URIS.index,
      name: "Entry index",
      description: "JSON index of all active entries.",
      mimeType: "application/json",
    },
  ];
}

function listResourceTemplates(): Array<{
  uriTemplate: string;
  name: string;
  description: string;
  mimeType: string;
}> {
  return [
    {
      uriTemplate: `${RESOURCE_URIS.entryPrefix}{id}`,
      name: "Entry",
      description: "Full entry body and metadata.",
      mimeType: "text/markdown",
    },
    {
      uriTemplate: `${RESOURCE_URIS.auditPrefix}{id}`,
      name: "Entry audit trail",
      description:
        "Filtered audit log entries that mention this entry id (newest first).",
      mimeType: "application/json",
    },
  ];
}

function listPrompts(): Array<{
  name: string;
  description: string;
  arguments: Array<{ name: string; description: string; required?: boolean }>;
}> {
  return Object.entries(PROMPT_DEFS).map(([name, def]) => ({
    name,
    description: def.description,
    arguments: def.arguments.map((arg) => ({
      name: arg.name,
      description: arg.description,
      ...(arg.required ? { required: true } : {}),
    })),
  }));
}

async function handlePromptGet(
  ctx: ServerContext,
  params: unknown,
): Promise<unknown> {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new RpcError(ERR.INVALID_PARAMS, "prompts/get requires an object");
  }
  const r = params as Record<string, unknown>;
  if (typeof r["name"] !== "string") {
    throw new RpcError(ERR.INVALID_PARAMS, "prompts/get: name is required");
  }
  if (r["name"] !== "priors_distill") {
    throw new RpcError(
      ERR.INVALID_PARAMS,
      `prompts/get: unknown prompt ${r["name"]}`,
    );
  }
  const args = (r["arguments"] ?? {}) as Record<string, unknown>;
  for (const required of ["source_kind", "source_ref", "source_content"]) {
    if (typeof args[required] !== "string") {
      throw new RpcError(
        ERR.INVALID_PARAMS,
        `prompts/get: missing argument ${required}`,
      );
    }
  }
  const meta = await requireProject(ctx.projectRoot);
  const projectId =
    typeof args["project_id"] === "string" ? args["project_id"] : meta.id;
  const rendered = renderSystemAndUser({
    source_kind: args["source_kind"] as
      | "transcript"
      | "tool_trace"
      | "session_log"
      | "manual_text",
    source_ref: args["source_ref"] as string,
    source_content: args["source_content"] as string,
    project_id: projectId,
  });
  return {
    description: PROMPT_DEFS.priors_distill.description,
    messages: [
      {
        role: "assistant",
        content: { type: "text", text: rendered.system },
      },
      {
        role: "user",
        content: { type: "text", text: rendered.user },
      },
    ],
  };
}

async function handleResourceRead(
  ctx: ServerContext,
  params: unknown,
): Promise<{ contents: ResourceContent[] }> {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new RpcError(ERR.INVALID_PARAMS, "resources/read requires an object");
  }
  const r = params as Record<string, unknown>;
  const uri = r["uri"];
  if (typeof uri !== "string") {
    throw new RpcError(ERR.INVALID_PARAMS, "resources/read: uri is required");
  }
  if (uri === RESOURCE_URIS.brief) {
    const brief = await assembleBrief(ctx.projectRoot);
    return {
      contents: [
        { uri, mimeType: "text/markdown", text: brief.text },
      ],
    };
  }
  if (uri === RESOURCE_URIS.index) {
    const text = await readIndexJson(ctx);
    return {
      contents: [{ uri, mimeType: "application/json", text }],
    };
  }
  if (uri.startsWith(RESOURCE_URIS.entryPrefix)) {
    const id = uri.slice(RESOURCE_URIS.entryPrefix.length);
    if (!isSafeId(id)) {
      throw new RpcError(
        ERR.INVALID_PARAMS,
        `resources/read: invalid entry id in ${uri}`,
      );
    }
    const entry = await findEntryById(ctx.projectRoot, id);
    if (entry) {
      return {
        contents: [
          {
            uri,
            mimeType: "text/markdown",
            text: entryToFileText(entry),
          },
        ],
      };
    }
    const staged = await readStagedEntry(ctx.projectRoot, id);
    if (staged) {
      return {
        contents: [
          {
            uri,
            mimeType: "text/markdown",
            text: entryToFileText(staged),
          },
        ],
      };
    }
    throw new RpcError(ERR.INVALID_PARAMS, `entry not found: ${id}`);
  }
  if (uri.startsWith(RESOURCE_URIS.auditPrefix)) {
    const id = uri.slice(RESOURCE_URIS.auditPrefix.length);
    if (!isSafeId(id)) {
      throw new RpcError(
        ERR.INVALID_PARAMS,
        `resources/read: invalid entry id in ${uri}`,
      );
    }
    const events = await readAuditForEntry(ctx.projectRoot, id);
    const text = JSON.stringify(
      { entry_id: id, events: events.map((e) => e.raw) },
      null,
      2,
    );
    return { contents: [{ uri, mimeType: "application/json", text }] };
  }
  throw new RpcError(ERR.INVALID_PARAMS, `unknown resource uri: ${uri}`);
}

async function readIndexJson(ctx: ServerContext): Promise<string> {
  try {
    return await fs.readFile(indexAllPath(ctx.projectRoot), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    const doc = await regenerateIndex(ctx.projectRoot);
    return JSON.stringify(doc, null, 2);
  }
}

async function handleToolCall(
  ctx: ServerContext,
  params: unknown,
): Promise<CallToolResponse> {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new RpcError(ERR.INVALID_PARAMS, "tools/call requires an object");
  }
  const r = params as Record<string, unknown>;
  const name = r["name"];
  if (typeof name !== "string") {
    throw new RpcError(ERR.INVALID_PARAMS, "tools/call: name is required");
  }
  const rawArgs = r["arguments"];
  const args =
    rawArgs === undefined || rawArgs === null
      ? {}
      : (rawArgs as Record<string, unknown>);

  const cacheKey = idempotencyKey(name, args);
  if (cacheKey) {
    const cached = ctx.idempotencyCache.get(cacheKey);
    if (cached) return wrapResult(cached.result);
  }

  let result: unknown;
  switch (name) {
    case "recall":
      result = await runRecall(ctx.projectRoot, args);
      break;
    case "get_entry":
      result = await runGetEntry(ctx, args);
      break;
    case "stage_learning":
      validateStageInput(args);
      result = await stageLearning(ctx.projectRoot, args);
      break;
    case "commit_learning":
      validateCommitInput(args);
      result = await commitLearning(ctx.projectRoot, args);
      break;
    case "mark_stale":
      validateMarkStaleInput(args);
      result = await markStale(ctx.projectRoot, args);
      break;
    case "link_entries":
      validateLinkInput(args);
      result = await linkEntries(ctx.projectRoot, args);
      break;
    default:
      throw new RpcError(ERR.METHOD_NOT_FOUND, `unknown tool: ${name}`);
  }

  if (cacheKey) cacheResponse(ctx, cacheKey, result);
  return wrapResult(result);
}

async function runGetEntry(
  ctx: ServerContext,
  args: Record<string, unknown>,
): Promise<unknown> {
  const id = args["id"];
  if (typeof id !== "string" || !isSafeId(id)) {
    throw new RpcError(
      ERR.INVALID_PARAMS,
      "get_entry: id is required and must be a safe id",
    );
  }
  const entry = await findEntryById(ctx.projectRoot, id);
  if (entry) {
    return {
      area: "entries",
      frontmatter: entry.frontmatter,
      body: entry.body,
      path: entry.location.relativePath,
    };
  }
  const staged = await readStagedEntry(ctx.projectRoot, id);
  if (staged) {
    return {
      area: "staged",
      frontmatter: staged.frontmatter,
      body: staged.body,
      path: staged.location.relativePath,
    };
  }
  throw new RpcError(ERR.INVALID_PARAMS, `entry not found: ${id}`);
}

function wrapResult(result: unknown): CallToolResponse {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    structuredContent: result,
  };
}

function idempotencyKey(
  toolName: string,
  args: Record<string, unknown>,
): string | null {
  const id = args["client_request_id"];
  if (typeof id !== "string" || id.length === 0) return null;
  return `${toolName}:${id}`;
}

function cacheResponse(
  ctx: ServerContext,
  key: string,
  result: unknown,
): void {
  if (ctx.idempotencyCache.size >= IDEMPOTENCY_CACHE_LIMIT) {
    const oldest = ctx.idempotencyCache.keys().next().value;
    if (oldest !== undefined) ctx.idempotencyCache.delete(oldest);
  }
  ctx.idempotencyCache.set(key, { result, ts: Date.now() });
}

// re-exported for tests
export { listEntries };
