import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { runMcpServer } from "../mcp/server.ts";
import { initProject, requireProject } from "../store/project.ts";
import { assembleBrief } from "../brief/assemble.ts";
import { recall } from "../recall/recall.ts";
import {
  commitLearning,
  stageLearning,
  type StageInput,
} from "../distill/stage.ts";
import {
  commitEdge,
  discardEdge,
  discardStaged,
  editStaged,
  linkEntries,
  markStale,
  proposeEdge,
} from "../curation/curation.ts";
import { readCurationLog } from "../store/audit-query.ts";
import { exportPack, importPack } from "../export/pack.ts";
import { runHealthCheck } from "../health/check.ts";
import {
  defaultNodeBin,
  defaultPriorsBin,
  renderClientConfig,
  SUPPORTED_CLIENTS,
  type SupportedClient,
} from "../clients/configs.ts";
import { runEvalSuite } from "../evals/runner.ts";
import {
  findEntryById,
  findIncomingEdges,
  readStagedEntry,
  entryToFileText,
} from "../store/entries.ts";
import { regenerateIndex } from "../store/index.ts";
import { indexAllPath } from "../store/paths.ts";
import { isSafeId } from "../util/safe-path.ts";
import { readAuditForEntry } from "../store/audit-query.ts";

interface CommonOpts {
  projectRoot: string;
  json: boolean;
  rest: string[];
}

const HELP = `priors v1 — project-scoped harness memory

Usage:
  priors <command> [--project-root PATH] [--json] [args]

Commands:
  init                          Create or refresh .priors/ in the project root
  init-config --client <c>      Print MCP server config snippet for a client
                                (claude | cursor | codex | raw)
  brief                         Print priors://brief
  recall [--query Q] [--kind K] [--status S] [--confidence C]
         [--as-of-after D] [--as-of-before D] [--limit N]
                                Search active entries
  get <id>                      Show a single entry
  stage --source-kind K --source-ref R --source-content @file
        [--candidates @file] [--existing @file] [--prompt-context S]
                                Stage candidate lessons
  commit <staged_id>            Promote a staged entry to active
  mark-stale <id> --reason R    Mark an entry as stale
  link <source> <relation> <target>
                                Link two entries (supersedes|contradiction_of|derived_from|
                                reinforces|caused_by|blocks|depends_on|refutes)
  discard <staged_id> [--rationale R] [--source-model M]
                                Discard a staged candidate without committing
  edit-staged <staged_id> [--claim C] [--confidence high|medium|low]
                            [--tags a,b] [--body @file] [--rationale R]
                                Modify a staged candidate before committing
  propose-edge <source> <relation> <target> [--rationale R] [--source-model M]
                                Record an LLM-proposed edge (does not create it)
  commit-edge <proposal_id> <source> <relation> <target>
                                Accept a proposed edge (creates the link)
  discard-edge <proposal_id> <source> <relation> <target>
                                Discard a proposed edge without creating it
  migrate-relations [--dry-run]
                                Rewrite legacy 'contradicts' keys to 'contradiction_of'
  export [--destination DIR]    Export active entries
  import <source> [--apply] [--overwrite]
                                Import a pack (default dry-run)
  audit <id>                    Show audit events filtered for an entry
  audit curation [--since DATE] [--kind K] [--source-model M]
                                Show curation log events
  index                         Print indexes/all.json (regenerates if missing)
  health [--fix]                Run integrity checks
  evals [--reporter json|text]  Run the v1 regression suite
  mcp                           Run the stdio MCP server (used by clients)

Global flags:
  --project-root PATH           Override the project root (default: cwd)
  --json                        Emit JSON instead of human-readable text
  -h, --help                    Show this help

`;

export async function run(argv: string[]): Promise<void> {
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    process.stdout.write(HELP);
    return;
  }
  const command = argv[0]!;
  const opts = parseCommon(argv.slice(1));

  switch (command) {
    case "init":
      await cmdInit(opts);
      return;
    case "init-config":
      await cmdInitConfig(opts);
      return;
    case "brief":
      await cmdBrief(opts);
      return;
    case "recall":
      await cmdRecall(opts);
      return;
    case "get":
    case "get-entry":
      await cmdGetEntry(opts);
      return;
    case "stage":
    case "stage-learning":
      await cmdStage(opts);
      return;
    case "commit":
    case "commit-learning":
      await cmdCommit(opts);
      return;
    case "mark-stale":
      await cmdMarkStale(opts);
      return;
    case "link":
    case "link-entries":
      await cmdLink(opts);
      return;
    case "discard":
    case "discard-staged":
      await cmdDiscard(opts);
      return;
    case "edit-staged":
      await cmdEditStaged(opts);
      return;
    case "propose-edge":
      await cmdProposeEdge(opts);
      return;
    case "commit-edge":
      await cmdCommitEdge(opts);
      return;
    case "discard-edge":
      await cmdDiscardEdge(opts);
      return;
    case "migrate-relations":
      await cmdMigrateRelations(opts);
      return;
    case "export":
      await cmdExport(opts);
      return;
    case "import":
      await cmdImport(opts);
      return;
    case "audit":
      await cmdAudit(opts);
      return;
    case "index":
      await cmdIndex(opts);
      return;
    case "health":
      await cmdHealth(opts);
      return;
    case "evals":
      await cmdEvals(opts);
      return;
    case "mcp":
      await cmdMcp(opts);
      return;
    default:
      throw new Error(`unknown command: ${command}\n\n${HELP}`);
  }
}

function parseCommon(args: string[]): CommonOpts {
  let projectRoot = process.cwd();
  let json = false;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--project-root") {
      const v = args[++i];
      if (!v) throw new Error("--project-root requires a value");
      projectRoot = path.resolve(v);
    } else if (a === "--project-root=" || a.startsWith("--project-root=")) {
      projectRoot = path.resolve(a.slice("--project-root=".length));
    } else if (a === "--json") {
      json = true;
    } else if (a === "-h" || a === "--help") {
      rest.push(a);
    } else {
      rest.push(a);
    }
  }
  return { projectRoot, json, rest };
}

function takeFlag(rest: string[], name: string): string | undefined {
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === `--${name}`) {
      const v = rest[i + 1];
      if (v === undefined) {
        throw new Error(`--${name} requires a value`);
      }
      rest.splice(i, 2);
      return v;
    }
    const eq = `--${name}=`;
    if (a.startsWith(eq)) {
      rest.splice(i, 1);
      return a.slice(eq.length);
    }
  }
  return undefined;
}

function takeBool(rest: string[], name: string): boolean {
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === `--${name}`) {
      rest.splice(i, 1);
      return true;
    }
  }
  return false;
}

function emit(opts: CommonOpts, label: string, payload: unknown): void {
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  if (label && label.length > 0) {
    process.stdout.write(`${label}\n`);
  }
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function cmdInit(opts: CommonOpts): Promise<void> {
  const meta = await initProject(opts.projectRoot);
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(meta, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    `priors: store at ${path.join(opts.projectRoot, ".priors")}\n`,
  );
  process.stdout.write(`  project_id   ${meta.id}\n`);
  process.stdout.write(`  project_name ${meta.name}\n`);
  process.stdout.write(`  created_at   ${meta.created_at}\n`);
}

async function cmdInitConfig(opts: CommonOpts): Promise<void> {
  const client = takeFlag(opts.rest, "client");
  const serverName = takeFlag(opts.rest, "name");
  if (!client) {
    throw new Error(
      `init-config: --client is required (one of ${SUPPORTED_CLIENTS.join(", ")})`,
    );
  }
  if (!SUPPORTED_CLIENTS.includes(client as SupportedClient)) {
    throw new Error(
      `init-config: unknown client ${client}; choose one of ${SUPPORTED_CLIENTS.join(", ")}`,
    );
  }
  const snippet = renderClientConfig({
    client: client as SupportedClient,
    projectRoot: opts.projectRoot,
    priorsBin: defaultPriorsBin(),
    nodeBin: defaultNodeBin(),
    ...(serverName ? { serverName } : {}),
  });
  process.stdout.write(`${snippet}\n`);
}

async function cmdBrief(opts: CommonOpts): Promise<void> {
  await requireProject(opts.projectRoot);
  const result = await assembleBrief(opts.projectRoot);
  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          tokens: result.tokens,
          totalTokens: result.totalTokens,
          text: result.text,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  process.stdout.write(result.text);
  if (!result.text.endsWith("\n")) process.stdout.write("\n");
}

async function cmdRecall(opts: CommonOpts): Promise<void> {
  await requireProject(opts.projectRoot);
  const query = takeFlag(opts.rest, "query");
  const kind = takeFlag(opts.rest, "kind");
  const status = takeFlag(opts.rest, "status");
  const confidence = takeFlag(opts.rest, "confidence");
  const asOfAfter = takeFlag(opts.rest, "as-of-after");
  const asOfBefore = takeFlag(opts.rest, "as-of-before");
  const limitStr = takeFlag(opts.rest, "limit");
  const input: Record<string, unknown> = {};
  if (query !== undefined) input["query"] = query;
  if (kind !== undefined) input["kind"] = kind;
  if (status !== undefined) input["status"] = status;
  if (confidence !== undefined) input["confidence"] = confidence;
  if (asOfAfter !== undefined) input["as_of_after"] = asOfAfter;
  if (asOfBefore !== undefined) input["as_of_before"] = asOfBefore;
  if (limitStr !== undefined) {
    const n = Number.parseInt(limitStr, 10);
    if (Number.isNaN(n)) throw new Error("--limit must be an integer");
    input["limit"] = n;
  }
  const result = await recall(opts.projectRoot, input);
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`recall: ${result.total} hit(s)\n`);
  for (const h of result.hits) {
    process.stdout.write(
      `  ${h.id}  [${h.kind}/${h.status}/${h.confidence}]  score=${h.score}\n    ${h.claim}\n`,
    );
  }
}

async function cmdGetEntry(opts: CommonOpts): Promise<void> {
  const id = opts.rest.shift();
  if (!id || !isSafeId(id)) {
    throw new Error("get: <id> is required and must be a safe id");
  }
  await requireProject(opts.projectRoot);
  const entry =
    (await findEntryById(opts.projectRoot, id)) ??
    (await readStagedEntry(opts.projectRoot, id));
  if (!entry) {
    throw new Error(`get: entry ${id} not found`);
  }
  const incoming =
    entry.location.area === "entries"
      ? await findIncomingEdges(opts.projectRoot, id)
      : {};
  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          area: entry.location.area,
          path: entry.location.relativePath,
          frontmatter: entry.frontmatter,
          body: entry.body,
          incoming_edges: incoming,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  process.stdout.write(entryToFileText(entry));
  const incomingKinds = Object.keys(incoming).sort();
  if (incomingKinds.length > 0) {
    process.stdout.write("\n## Incoming edges\n\n");
    for (const k of incomingKinds) {
      process.stdout.write(`- ${k}: ${incoming[k]!.join(", ")}\n`);
    }
  }
}

async function cmdStage(opts: CommonOpts): Promise<void> {
  const sourceKind = takeFlag(opts.rest, "source-kind");
  const sourceRef = takeFlag(opts.rest, "source-ref");
  const sourceContentArg = takeFlag(opts.rest, "source-content");
  const candidatesArg = takeFlag(opts.rest, "candidates");
  const existingArg = takeFlag(opts.rest, "existing");
  const promptContext = takeFlag(opts.rest, "prompt-context");
  const projectIdArg = takeFlag(opts.rest, "project-id");
  if (!sourceKind || !sourceRef || !sourceContentArg) {
    throw new Error(
      "stage: --source-kind, --source-ref, --source-content (or @file) are required",
    );
  }
  const meta = await requireProject(opts.projectRoot);
  const sourceContent = await resolveContent(sourceContentArg);
  const input: StageInput = {
    source_kind: sourceKind as StageInput["source_kind"],
    source_ref: sourceRef,
    source_content: sourceContent,
    project_id: projectIdArg ?? meta.id,
  };
  if (candidatesArg) {
    const text = await resolveContent(candidatesArg);
    input.candidates = JSON.parse(text);
  }
  if (existingArg) {
    const text = await resolveContent(existingArg);
    input.existing_entries = JSON.parse(text);
  }
  if (promptContext) input.prompt_context = promptContext;
  const result = await stageLearning(opts.projectRoot, input);
  emit(opts, "stage_learning:", result);
}

async function resolveContent(arg: string): Promise<string> {
  if (arg.startsWith("@")) {
    const file = arg.slice(1);
    return await fs.readFile(file, "utf8");
  }
  if (arg === "-") {
    return await readStdin();
  }
  return arg;
}

async function readStdin(): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (c) => chunks.push(c as Buffer));
    process.stdin.on("end", () =>
      resolve(Buffer.concat(chunks).toString("utf8")),
    );
    process.stdin.on("error", reject);
  });
}

async function cmdCommit(opts: CommonOpts): Promise<void> {
  const id = opts.rest.shift();
  if (!id) throw new Error("commit: <staged_id> is required");
  await requireProject(opts.projectRoot);
  const result = await commitLearning(opts.projectRoot, { staged_id: id });
  emit(opts, "commit_learning:", result);
}

async function cmdMarkStale(opts: CommonOpts): Promise<void> {
  const id = opts.rest.shift();
  if (!id) throw new Error("mark-stale: <id> is required");
  const reason = takeFlag(opts.rest, "reason");
  if (!reason) throw new Error("mark-stale: --reason is required");
  await requireProject(opts.projectRoot);
  const result = await markStale(opts.projectRoot, { id, reason });
  emit(opts, "mark_stale:", result);
}

async function cmdLink(opts: CommonOpts): Promise<void> {
  const source = opts.rest.shift();
  const relation = opts.rest.shift();
  const target = opts.rest.shift();
  if (!source || !relation || !target) {
    throw new Error("link: <source_id> <relation> <target_id> are required");
  }
  await requireProject(opts.projectRoot);
  const result = await linkEntries(opts.projectRoot, {
    source_id: source,
    relation,
    target_id: target,
  });
  emit(opts, "link_entries:", result);
}

async function cmdExport(opts: CommonOpts): Promise<void> {
  const destination = takeFlag(opts.rest, "destination");
  await requireProject(opts.projectRoot);
  const result = await exportPack(
    opts.projectRoot,
    destination ? { destination } : {},
  );
  emit(opts, "export_pack:", {
    destination: result.destination,
    written: result.written,
    manifest_entries: result.manifest.entries.length,
  });
}

async function cmdImport(opts: CommonOpts): Promise<void> {
  const source = opts.rest.shift();
  if (!source) throw new Error("import: <source> directory is required");
  const apply = takeBool(opts.rest, "apply");
  const overwrite = takeBool(opts.rest, "overwrite");
  await requireProject(opts.projectRoot);
  const result = await importPack(opts.projectRoot, {
    source,
    dry_run: !apply,
    overwrite,
  });
  emit(opts, "import_pack:", {
    applied: result.applied,
    added: result.added,
    overwritten: result.overwritten,
    plan: result.plan,
  });
}

async function cmdAudit(opts: CommonOpts): Promise<void> {
  const first = opts.rest.shift();
  if (!first) throw new Error("audit: <id> or 'curation' is required");
  if (first === "curation") {
    await cmdAuditCuration(opts);
    return;
  }
  if (!isSafeId(first)) throw new Error("audit: <id> is required");
  await requireProject(opts.projectRoot);
  const events = await readAuditForEntry(opts.projectRoot, first);
  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify(
        { entry_id: first, events: events.map((e) => e.raw) },
        null,
        2,
      )}\n`,
    );
    return;
  }
  if (events.length === 0) {
    process.stdout.write(`audit: no events for ${first}\n`);
    return;
  }
  for (const e of events) {
    process.stdout.write(`${e.ts}  ${e.action}  (${e.source})\n`);
  }
}

async function cmdAuditCuration(opts: CommonOpts): Promise<void> {
  await requireProject(opts.projectRoot);
  const since = takeFlag(opts.rest, "since");
  const kindFilter = takeFlag(opts.rest, "kind");
  const sourceModelFilter = takeFlag(opts.rest, "source-model");
  let events = await readCurationLog(opts.projectRoot);
  if (since) events = events.filter((e) => e.ts >= since);
  if (kindFilter) {
    events = events.filter((e) => e.raw["kind"] === kindFilter);
  }
  if (sourceModelFilter) {
    events = events.filter((e) => e.raw["source_model"] === sourceModelFilter);
  }
  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify(
        { events: events.map((e) => e.raw) },
        null,
        2,
      )}\n`,
    );
    return;
  }
  if (events.length === 0) {
    process.stdout.write("audit curation: no events\n");
    return;
  }
  for (const e of events) {
    const k = String(e.raw["kind"] ?? "?");
    const sm = String(e.raw["source_model"] ?? "?");
    const id =
      (e.raw["staged_id"] as string | undefined) ??
      (e.raw["entry_id"] as string | undefined) ??
      "";
    process.stdout.write(`${e.ts}  ${k.padEnd(8)} ${sm.padEnd(20)} ${id}\n`);
  }
}

async function cmdDiscard(opts: CommonOpts): Promise<void> {
  const id = opts.rest.shift();
  if (!id) throw new Error("discard: <staged_id> is required");
  const rationale = takeFlag(opts.rest, "rationale");
  const sourceModel = takeFlag(opts.rest, "source-model");
  await requireProject(opts.projectRoot);
  const result = await discardStaged(opts.projectRoot, {
    staged_id: id,
    ...(rationale ? { rationale } : {}),
    ...(sourceModel ? { source_model: sourceModel } : {}),
  });
  emit(opts, "discard_staged:", result);
}

async function cmdProposeEdge(opts: CommonOpts): Promise<void> {
  const source = opts.rest.shift();
  const relation = opts.rest.shift();
  const target = opts.rest.shift();
  if (!source || !relation || !target) {
    throw new Error(
      "propose-edge: <source_id> <relation> <target_id> are required",
    );
  }
  const rationale = takeFlag(opts.rest, "rationale");
  const sourceModel = takeFlag(opts.rest, "source-model");
  const sourceRef = takeFlag(opts.rest, "source-ref");
  const proposalId = takeFlag(opts.rest, "proposal-id");
  await requireProject(opts.projectRoot);
  const result = await proposeEdge(opts.projectRoot, {
    source_id: source,
    relation,
    target_id: target,
    ...(rationale ? { rationale } : {}),
    ...(sourceModel ? { source_model: sourceModel } : {}),
    ...(sourceRef ? { source_ref: sourceRef } : {}),
    ...(proposalId ? { proposal_id: proposalId } : {}),
  });
  emit(opts, "propose_edge:", result);
}

async function cmdCommitEdge(opts: CommonOpts): Promise<void> {
  const proposalId = opts.rest.shift();
  const source = opts.rest.shift();
  const relation = opts.rest.shift();
  const target = opts.rest.shift();
  if (!proposalId || !source || !relation || !target) {
    throw new Error(
      "commit-edge: <proposal_id> <source_id> <relation> <target_id> are required",
    );
  }
  const rationale = takeFlag(opts.rest, "rationale");
  await requireProject(opts.projectRoot);
  const result = await commitEdge(opts.projectRoot, {
    proposal_id: proposalId,
    source_id: source,
    relation,
    target_id: target,
    ...(rationale ? { rationale } : {}),
  });
  emit(opts, "commit_edge:", result);
}

async function cmdDiscardEdge(opts: CommonOpts): Promise<void> {
  const proposalId = opts.rest.shift();
  const source = opts.rest.shift();
  const relation = opts.rest.shift();
  const target = opts.rest.shift();
  if (!proposalId || !source || !relation || !target) {
    throw new Error(
      "discard-edge: <proposal_id> <source_id> <relation> <target_id> are required",
    );
  }
  const rationale = takeFlag(opts.rest, "rationale");
  await requireProject(opts.projectRoot);
  const result = await discardEdge(opts.projectRoot, {
    proposal_id: proposalId,
    source_id: source,
    relation,
    target_id: target,
    ...(rationale ? { rationale } : {}),
  });
  emit(opts, "discard_edge:", result);
}

async function cmdMigrateRelations(opts: CommonOpts): Promise<void> {
  await requireProject(opts.projectRoot);
  const dryRun = takeBool(opts.rest, "dry-run");
  const { migrateRelations } = await import("../store/migrate-relations.ts");
  const result = await migrateRelations(opts.projectRoot, { dryRun });
  emit(opts, "migrate_relations:", result);
}

async function cmdEditStaged(opts: CommonOpts): Promise<void> {
  const id = opts.rest.shift();
  if (!id) throw new Error("edit-staged: <staged_id> is required");
  const claim = takeFlag(opts.rest, "claim");
  const confidence = takeFlag(opts.rest, "confidence");
  const tagsArg = takeFlag(opts.rest, "tags");
  const bodyArg = takeFlag(opts.rest, "body");
  const rationale = takeFlag(opts.rest, "rationale");
  const sourceModel = takeFlag(opts.rest, "source-model");
  const input: Record<string, unknown> = { staged_id: id };
  if (claim !== undefined) input["claim"] = claim;
  if (confidence !== undefined) input["confidence"] = confidence;
  if (tagsArg !== undefined) {
    input["tags"] = tagsArg
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }
  if (bodyArg !== undefined) input["body"] = await resolveContent(bodyArg);
  if (rationale !== undefined) input["rationale"] = rationale;
  if (sourceModel !== undefined) input["source_model"] = sourceModel;
  await requireProject(opts.projectRoot);
  const result = await editStaged(opts.projectRoot, input);
  emit(opts, "edit_staged:", result);
}

async function cmdIndex(opts: CommonOpts): Promise<void> {
  await requireProject(opts.projectRoot);
  let text: string;
  try {
    text = await fs.readFile(indexAllPath(opts.projectRoot), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    const doc = await regenerateIndex(opts.projectRoot);
    text = `${JSON.stringify(doc, null, 2)}\n`;
  }
  process.stdout.write(text);
}

async function cmdHealth(opts: CommonOpts): Promise<void> {
  const fix = takeBool(opts.rest, "fix");
  const report = await runHealthCheck(opts.projectRoot, { fix });
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(formatHealth(report));
  }
  if (!report.ok) process.exitCode = 1;
}

function formatHealth(report: Awaited<ReturnType<typeof runHealthCheck>>): string {
  const lines: string[] = [];
  lines.push(`priors health: ${report.ok ? "ok" : "errors"}`);
  if (report.project) {
    lines.push(`  project ${report.project.id}  (${report.project.name})`);
  }
  lines.push(
    `  counts active=${report.counts.active} staged=${report.counts.staged} stale=${report.counts.stale} superseded=${report.counts.superseded} contested=${report.counts.contested}`,
  );
  for (const issue of report.issues) {
    const id = issue.entry_id ? ` ${issue.entry_id}` : "";
    lines.push(`  [${issue.severity}] ${issue.code}${id}: ${issue.message}`);
  }
  if (report.issues.length === 0) lines.push("  no issues");
  return `${lines.join("\n")}\n`;
}

async function cmdEvals(opts: CommonOpts): Promise<void> {
  const reporter = takeFlag(opts.rest, "reporter") ?? "text";
  const result = await runEvalSuite();
  if (reporter === "json" || opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`priors evals: ${result.passed}/${result.total} passed\n`);
    for (const t of result.tasks) {
      const ok = t.ok ? "PASS" : "FAIL";
      process.stdout.write(`  ${ok}  ${t.id}  ${t.name}\n`);
      if (!t.ok && t.error) {
        process.stdout.write(`        ${t.error}\n`);
      }
    }
  }
  if (!result.ok) process.exitCode = 1;
}

async function cmdMcp(opts: CommonOpts): Promise<void> {
  const meta = await requireProject(opts.projectRoot).catch(() => null);
  if (!meta) {
    await initProject(opts.projectRoot);
  }
  await runMcpServer({ projectRoot: opts.projectRoot });
}
