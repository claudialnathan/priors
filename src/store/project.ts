import fs from "node:fs/promises";
import { atomicWrite, ensureDir } from "../util/atomic-write.ts";
import { newUuid, isUuid } from "../util/uuid.ts";
import { isoDatetime, systemClock, type Clock } from "../util/clock.ts";
import {
  auditDir,
  briefMd,
  entriesDir,
  exportsDir,
  indexesDir,
  logMd,
  priorsRoot,
  projectJson,
  stagedDir,
} from "./paths.ts";
import path from "node:path";
import { appendAudit } from "./audit.ts";

export interface ProjectMeta {
  id: string;
  name: string;
  created_at: string;
  schema_version: 1;
}

export async function readProject(projectRoot: string): Promise<ProjectMeta | null> {
  try {
    const text = await fs.readFile(projectJson(projectRoot), "utf8");
    const parsed = JSON.parse(text) as Partial<ProjectMeta>;
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      !isUuid(parsed.id) ||
      typeof parsed.name !== "string" ||
      typeof parsed.created_at !== "string" ||
      parsed.schema_version !== 1
    ) {
      throw new Error(
        `invalid project.json at ${projectJson(projectRoot)}: missing or malformed fields`,
      );
    }
    return parsed as ProjectMeta;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function requireProject(projectRoot: string): Promise<ProjectMeta> {
  const meta = await readProject(projectRoot);
  if (!meta) {
    throw new Error(
      `no .priors store found at ${projectRoot}. Run \`priors init\` first.`,
    );
  }
  return meta;
}

export interface InitOptions {
  name?: string;
  clock?: Clock;
  force?: boolean;
}

export async function initProject(
  projectRoot: string,
  opts: InitOptions = {},
): Promise<ProjectMeta> {
  const clock = opts.clock ?? systemClock;
  const existing = await readProject(projectRoot);
  if (existing && !opts.force) return existing;

  const name = opts.name ?? path.basename(path.resolve(projectRoot));
  const meta: ProjectMeta = {
    id: existing?.id ?? newUuid(),
    name,
    created_at: existing?.created_at ?? isoDatetime(clock.now()),
    schema_version: 1,
  };

  await ensureDir(priorsRoot(projectRoot));
  await ensureDir(entriesDir(projectRoot));
  await ensureDir(stagedDir(projectRoot));
  await ensureDir(indexesDir(projectRoot));
  await ensureDir(auditDir(projectRoot));
  await ensureDir(exportsDir(projectRoot));

  await atomicWrite(
    projectJson(projectRoot),
    `${JSON.stringify(meta, null, 2)}\n`,
  );

  for (const file of [briefMd, logMd]) {
    const p = file(projectRoot);
    try {
      await fs.access(p);
    } catch {
      await atomicWrite(p, "");
    }
  }

  await appendAudit(projectRoot, {
    action: "init",
    actor: "cli",
    project_id: meta.id,
    note: existing
      ? "store re-initialized (idempotent)"
      : "store initialized",
    ts: isoDatetime(clock.now()),
  });

  return meta;
}
