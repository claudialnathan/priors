import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initProject } from "../store/project.ts";
import { writeEntry } from "../store/entries.ts";
import { regenerateIndex } from "../store/index.ts";
import { recall } from "../recall/recall.ts";
import { assembleBrief } from "../brief/assemble.ts";
import { stageLearning, commitLearning } from "../distill/stage.ts";
import { linkEntries, markStale } from "../curation/curation.ts";
import { exportPack, importPack } from "../export/pack.ts";
import { runMcpServer } from "../mcp/server.ts";
import { fixedClock } from "../util/clock.ts";
import type { Entry, EntryKind } from "../schema/entry.ts";
import type { Clock } from "../util/clock.ts";
import { Readable, Writable } from "node:stream";

export interface EvalTaskResult {
  id: string;
  name: string;
  ok: boolean;
  detail?: string;
  error?: string;
}

export interface EvalSuiteResult {
  ok: boolean;
  total: number;
  passed: number;
  failed: number;
  tasks: EvalTaskResult[];
}

interface TaskDef {
  id: string;
  name: string;
  run: () => Promise<string | undefined>;
}

const TASKS: TaskDef[] = [
  {
    id: "fresh_agent_handoff",
    name: "Fresh agent handoff: brief is bounded and orienting",
    run: freshAgentHandoff,
  },
  {
    id: "dead_end_recall",
    name: "Dead-end recall: failure entries surface with reasons",
    run: deadEndRecall,
  },
  {
    id: "mark_stale_flow",
    name: "Mark-stale flow: brief and recall reflect stale state",
    run: markStaleFlow,
  },
  {
    id: "conflict_contested",
    name: "Conflict/contested: contradicts link sets both contested",
    run: conflictContested,
  },
  {
    id: "distillation_safety",
    name: "Distillation safety: fabricated claim is rejected",
    run: distillationSafety,
  },
  {
    id: "emission_deferred",
    name: "Emission deferred: emit_constraint is not in v1",
    run: emissionDeferred,
  },
  {
    id: "cross_client",
    name: "Cross-client: CLI and MCP read the same store",
    run: crossClient,
  },
];

export async function runEvalSuite(): Promise<EvalSuiteResult> {
  const tasks: EvalTaskResult[] = [];
  for (const t of TASKS) {
    try {
      const detail = await t.run();
      tasks.push({
        id: t.id,
        name: t.name,
        ok: true,
        ...(detail ? { detail } : {}),
      });
    } catch (err) {
      tasks.push({
        id: t.id,
        name: t.name,
        ok: false,
        error: (err as Error).message,
      });
    }
  }
  const passed = tasks.filter((t) => t.ok).length;
  return {
    ok: passed === tasks.length,
    total: tasks.length,
    passed,
    failed: tasks.length - passed,
    tasks,
  };
}

async function withTempStore<T>(
  fn: (root: string, clock: Clock) => Promise<T>,
): Promise<T> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "priors-eval-"));
  const clock = fixedClock("2026-04-26T00:00:00Z");
  try {
    await initProject(root, { name: "eval-fixture", clock });
    return await fn(root, clock);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function seedEntry(
  root: string,
  clock: Clock,
  fields: {
    id: string;
    kind: EntryKind;
    claim: string;
    confidence?: "high" | "medium" | "low";
    tags?: string[];
  },
): Promise<void> {
  const ts = "2026-04-26T00:00:00Z";
  const entry: Entry = {
    frontmatter: {
      id: fields.id,
      kind: fields.kind,
      status: "active",
      confidence: fields.confidence ?? "medium",
      claim: fields.claim,
      as_of: "2026-04-26",
      created_at: ts,
      updated_at: ts,
      relations: {
        supersedes: [],
        contradicts: [],
        reinforces: [],
        derived_from: [],
      },
      tags: fields.tags ?? [],
    },
    body: `\n## Notes\n\nSeeded for eval task ${fields.id}.\n`,
  };
  await writeEntry(root, entry);
  await regenerateIndex(root, { clock });
}

async function freshAgentHandoff(): Promise<string> {
  return withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-eval-decision-1",
      kind: "decision",
      claim: "Use TypeScript on Node 25 with native type stripping.",
      confidence: "high",
    });
    const brief = await assembleBrief(root, { clock });
    if (!brief.text.includes("Use TypeScript on Node 25")) {
      throw new Error("brief did not include the seeded decision claim");
    }
    if (brief.totalTokens > 2000) {
      throw new Error(`brief exceeded 2000 tokens (${brief.totalTokens})`);
    }
    if (!brief.text.startsWith("# Project trajectory brief")) {
      throw new Error("brief is missing project header");
    }
    if (!brief.text.includes("eval-fixture")) {
      throw new Error("brief is missing project name in header");
    }
    return `brief totalTokens=${brief.totalTokens}`;
  });
}

async function deadEndRecall(): Promise<string> {
  return withTempStore(async (root, clock) => {
    await writeFailureWithReason(root, clock, {
      id: "pri-eval-failure-1",
      claim: "Active decay overcomplicated v0.3; a manual stage step is enough.",
      reason: "active decay required hidden state and a daemon — neither shipped",
      tags: ["decay"],
    });
    const result = await recall(root, { kind: "failure", query: "decay" });
    if (result.hits.length === 0) {
      throw new Error("recall(kind:failure) returned no hits");
    }
    if (!result.hits.some((h) => h.id === "pri-eval-failure-1")) {
      throw new Error("recall(kind:failure) did not surface the dead end");
    }
    const brief = await assembleBrief(root, { clock });
    if (!brief.text.includes("rejected because")) {
      throw new Error("brief did not surface the rejection reason for the dead end");
    }
    return `hits=${result.hits.length}`;
  });
}

async function writeFailureWithReason(
  root: string,
  clock: Clock,
  fields: { id: string; claim: string; reason: string; tags?: string[] },
): Promise<void> {
  const ts = "2026-04-26T00:00:00Z";
  const entry: Entry = {
    frontmatter: {
      id: fields.id,
      kind: "failure",
      status: "active",
      confidence: "high",
      claim: fields.claim,
      as_of: "2026-04-26",
      created_at: ts,
      updated_at: ts,
      relations: {
        supersedes: [],
        contradicts: [],
        reinforces: [],
        derived_from: [],
      },
      tags: fields.tags ?? [],
    },
    body: `\n## Notes\n\nApproach rejected because ${fields.reason}.\n`,
  };
  await writeEntry(root, entry);
  await regenerateIndex(root, { clock });
}

async function markStaleFlow(): Promise<string> {
  return withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-eval-decision-2-keep",
      kind: "decision",
      claim: "Keep the manual distillation flow until v2.",
      confidence: "high",
    });
    await seedEntry(root, clock, {
      id: "pri-eval-decision-2-stale",
      kind: "decision",
      claim: "Auto-distill on every PR.",
      confidence: "medium",
    });
    const briefBefore = await assembleBrief(root, { clock });
    if (!briefBefore.text.includes("Auto-distill on every PR.")) {
      throw new Error("seeded decision did not appear in brief before mark-stale");
    }
    const result = await markStale(root, {
      id: "pri-eval-decision-2-stale",
      reason: "Manual stage flow is the v1 path; auto-distill is deferred.",
    });
    if (result.status !== "stale") throw new Error("status was not stale");
    const recalled = await recall(root, { status: "stale" });
    if (!recalled.hits.some((h) => h.id === "pri-eval-decision-2-stale")) {
      throw new Error("recall(status:stale) did not surface the entry");
    }
    const briefAfter = await assembleBrief(root, { clock });
    if (briefAfter.text.includes("Auto-distill on every PR.")) {
      throw new Error("brief still surfaces stale decision after mark-stale");
    }
    if (!briefAfter.text.includes("Keep the manual distillation flow")) {
      throw new Error("brief dropped the unrelated active decision");
    }
    return "stale flow ok";
  });
}

async function conflictContested(): Promise<string> {
  return withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-eval-decision-3a",
      kind: "decision",
      claim: "Use the deterministic brief assembler.",
      confidence: "high",
    });
    await seedEntry(root, clock, {
      id: "pri-eval-decision-3b",
      kind: "decision",
      claim: "Generate the brief with a model at request time.",
      confidence: "low",
    });
    const link = await linkEntries(root, {
      source_id: "pri-eval-decision-3b",
      relation: "contradicts",
      target_id: "pri-eval-decision-3a",
    });
    if (!link.contested_pair) {
      throw new Error("contradicts link did not set contested_pair");
    }
    const brief = await assembleBrief(root, { clock });
    if (!brief.text.toLowerCase().includes("contested")) {
      throw new Error("brief does not surface contested entries");
    }
    return `contested=${link.contested_pair.join(",")}`;
  });
}

async function distillationSafety(): Promise<string> {
  return withTempStore(async (root) => {
    const sourceContent =
      "We chose Postgres for the relational store and Redis for caching session ids.";
    const result = await stageLearning(root, {
      source_kind: "manual_text",
      source_ref: "eval://distillation-safety",
      source_content: sourceContent,
      project_id: "eval-distillation-safety",
      candidates: [
        {
          kind: "decision",
          claim: "Adopt MongoDB for the primary database.",
          evidence: [
            {
              quote: "We chose MongoDB for the primary store.",
              source_ref: "eval://distillation-safety",
              location: "para 1",
            },
          ],
          reasoning: "Fabricated claim — MongoDB is not mentioned in the source.",
          confidence: "high",
        },
        {
          kind: "decision",
          claim: "Use Postgres for the relational store.",
          evidence: [
            {
              quote: "We chose Postgres for the relational store",
              source_ref: "eval://distillation-safety",
              location: "para 1",
            },
          ],
          reasoning: "Source explicitly states the Postgres choice.",
          confidence: "high",
        },
      ],
    });
    if (result.staged.length !== 1) {
      throw new Error(
        `expected exactly 1 staged candidate, got ${result.staged.length}`,
      );
    }
    if (
      !result.rejected.some((r) => r.reason_code === "quote_not_in_source")
    ) {
      throw new Error("fabricated candidate was not rejected");
    }
    const stagedId = result.staged[0]!.id;
    const commit = await commitLearning(root, { staged_id: stagedId });
    if (commit.noop) throw new Error("commit_learning treated as noop");
    return `staged=1 rejected=${result.rejected.length}`;
  });
}

async function emissionDeferred(): Promise<string> {
  return withTempStore(async (root) => {
    const send = makeRpcDriver(root);
    await send({ jsonrpc: "2.0", id: 1, method: "initialize" });
    const listed = (await send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    })) as { result: { tools: Array<{ name: string }> } };
    const names = listed.result.tools.map((t) => t.name);
    if (names.includes("emit_constraint")) {
      throw new Error("emit_constraint is exposed in tools/list (must not be in v1)");
    }
    const callRes = (await send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "emit_constraint", arguments: {} },
    })) as { error?: { code: number; message: string } };
    if (!callRes.error) {
      throw new Error("expected error when calling emit_constraint, got result");
    }
    return "emit_constraint absent and rejected";
  });
}

async function crossClient(): Promise<string> {
  return withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-eval-decision-cc",
      kind: "decision",
      claim: "Cross-client portability: CLI and MCP must agree.",
      confidence: "high",
    });
    const exportResult = await exportPack(root, {}, { clock });

    const importRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "priors-eval-import-"),
    );
    try {
      await initProject(importRoot, { name: "eval-import", clock });
      const dryRun = await importPack(
        importRoot,
        { source: exportResult.destination },
        { clock },
      );
      if (dryRun.applied) {
        throw new Error("dry-run import applied changes");
      }
      const applied = await importPack(
        importRoot,
        { source: exportResult.destination, dry_run: false },
        { clock },
      );
      if (applied.added !== 1) {
        throw new Error(`expected to add 1 entry, got ${applied.added}`);
      }
      const send = makeRpcDriver(importRoot);
      await send({ jsonrpc: "2.0", id: 1, method: "initialize" });
      const indexRes = (await send({
        jsonrpc: "2.0",
        id: 2,
        method: "resources/read",
        params: { uri: "priors://index" },
      })) as { result: { contents: Array<{ text: string }> } };
      const text = indexRes.result.contents[0]!.text;
      if (!text.includes("pri-eval-decision-cc")) {
        throw new Error("index from MCP did not include exported entry");
      }
      return `exported=${exportResult.written} imported=${applied.added}`;
    } finally {
      await fs.rm(importRoot, { recursive: true, force: true });
    }
  });
}

interface RpcDriver {
  (req: Record<string, unknown>): Promise<Record<string, unknown>>;
}

function makeRpcDriver(projectRoot: string): RpcDriver {
  return async (req) => {
    const input = Readable.from([`${JSON.stringify(req)}\n`]);
    const chunks: string[] = [];
    const output = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
        cb();
      },
    });
    await runMcpServer({ projectRoot, input, output });
    const text = chunks.join("");
    const lines = text.split("\n").filter((l) => l.length > 0);
    if (lines.length === 0) return { jsonrpc: "2.0", id: req["id"], result: null };
    const last = lines[lines.length - 1]!;
    return JSON.parse(last) as Record<string, unknown>;
  };
}
