import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { atomicWrite, ensureDir } from "../util/atomic-write.ts";
import { isoDatetime, systemClock, type Clock } from "../util/clock.ts";
import { isSafeId } from "../util/safe-path.ts";
import {
  entryToFileText,
  listEntries,
  readEntryFile,
  writeEntry,
  type LoadedEntry,
} from "../store/entries.ts";
import { regenerateIndex } from "../store/index.ts";
import { appendAudit } from "../store/audit.ts";
import { requireProject } from "../store/project.ts";
import {
  entryPathFor,
  exportsDir,
  kindToDir,
  priorsRoot,
} from "../store/paths.ts";
import { ENTRY_KINDS, type EntryKind } from "../schema/entry.ts";

export interface ExportManifest {
  schema_version: 1;
  project_id: string;
  project_name: string;
  generated_at: string;
  entries: Array<{
    id: string;
    kind: EntryKind;
    sha256: string;
    path: string;
  }>;
}

export interface ExportInput {
  /** Destination path. If omitted, exports to `<priors>/exports/<timestamp>/`. */
  destination?: string;
  client_request_id?: string;
}

export interface ExportResult {
  destination: string;
  manifest: ExportManifest;
  written: number;
}

export function validateExportInput(raw: unknown): ExportInput {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("export_pack: input must be an object");
  }
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) {
    if (!["destination", "client_request_id"].includes(k)) {
      throw new Error(`export_pack: unknown field ${k}`);
    }
  }
  const out: ExportInput = {};
  if (r["destination"] !== undefined) {
    if (typeof r["destination"] !== "string" || r["destination"].length === 0) {
      throw new Error("export_pack: destination must be a non-empty string");
    }
    out.destination = r["destination"];
  }
  if (r["client_request_id"] !== undefined) {
    if (typeof r["client_request_id"] !== "string") {
      throw new Error("export_pack: client_request_id must be a string");
    }
    out.client_request_id = r["client_request_id"];
  }
  return out;
}

export async function exportPack(
  projectRoot: string,
  rawInput: unknown,
  opts: { clock?: Clock } = {},
): Promise<ExportResult> {
  const input = validateExportInput(rawInput);
  const clock = opts.clock ?? systemClock;
  const meta = await requireProject(projectRoot);
  const stamp = isoDatetime(clock.now()).replaceAll(/[-:T]/g, "").slice(0, 15);
  const destination = path.resolve(
    input.destination ?? path.join(exportsDir(projectRoot), stamp),
  );
  await ensureDir(destination);
  await ensureDir(path.join(destination, "entries"));

  const entries = await listEntries(projectRoot);
  const manifestEntries: ExportManifest["entries"] = [];
  for (const entry of entries) {
    if (entry.frontmatter.status !== "active" && entry.frontmatter.status !== "action_pending") {
      continue;
    }
    const rel = path.posix.join(
      "entries",
      kindToDir(entry.frontmatter.kind),
      `${entry.frontmatter.id}.md`,
    );
    const dest = path.join(destination, rel);
    await ensureDir(path.dirname(dest));
    const text = entryToFileText(entry);
    await atomicWrite(dest, text);
    manifestEntries.push({
      id: entry.frontmatter.id,
      kind: entry.frontmatter.kind,
      sha256: createHash("sha256").update(text).digest("hex"),
      path: rel,
    });
  }
  manifestEntries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const manifest: ExportManifest = {
    schema_version: 1,
    project_id: meta.id,
    project_name: meta.name,
    generated_at: isoDatetime(clock.now()),
    entries: manifestEntries,
  };
  await atomicWrite(
    path.join(destination, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  await appendAudit(projectRoot, {
    action: "export_pack",
    actor: "tool",
    project_id: meta.id,
    ts: isoDatetime(clock.now()),
    note: `exported ${manifestEntries.length} active entries to ${destination}`,
    ...(input.client_request_id
      ? { client_request_id: input.client_request_id }
      : {}),
  });

  return { destination, manifest, written: manifestEntries.length };
}

export interface ImportInput {
  source: string;
  dry_run?: boolean;
  overwrite?: boolean;
  client_request_id?: string;
}

export interface ImportPlan {
  to_add: Array<{ id: string; kind: EntryKind }>;
  to_skip: Array<{ id: string; reason: string }>;
  to_overwrite: Array<{ id: string; kind: EntryKind }>;
}

export interface ImportResult {
  source: string;
  manifest: ExportManifest;
  plan: ImportPlan;
  applied: boolean;
  added: number;
  overwritten: number;
}

export function validateImportInput(raw: unknown): ImportInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("import_pack: input must be an object");
  }
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) {
    if (
      !["source", "dry_run", "overwrite", "client_request_id"].includes(k)
    ) {
      throw new Error(`import_pack: unknown field ${k}`);
    }
  }
  if (typeof r["source"] !== "string" || r["source"].length === 0) {
    throw new Error("import_pack: source is required");
  }
  if (r["dry_run"] !== undefined && typeof r["dry_run"] !== "boolean") {
    throw new Error("import_pack: dry_run must be a boolean");
  }
  if (r["overwrite"] !== undefined && typeof r["overwrite"] !== "boolean") {
    throw new Error("import_pack: overwrite must be a boolean");
  }
  if (
    r["client_request_id"] !== undefined &&
    typeof r["client_request_id"] !== "string"
  ) {
    throw new Error("import_pack: client_request_id must be a string");
  }
  return {
    source: r["source"] as string,
    dry_run: (r["dry_run"] as boolean | undefined) ?? true,
    overwrite: (r["overwrite"] as boolean | undefined) ?? false,
    ...(r["client_request_id"] !== undefined
      ? { client_request_id: r["client_request_id"] as string }
      : {}),
  };
}

export async function importPack(
  projectRoot: string,
  rawInput: unknown,
  opts: { clock?: Clock } = {},
): Promise<ImportResult> {
  const input = validateImportInput(rawInput);
  const clock = opts.clock ?? systemClock;
  await requireProject(projectRoot);

  const sourcePath = path.resolve(input.source);
  const manifestPath = path.join(sourcePath, "manifest.json");
  let manifest: ExportManifest;
  try {
    const text = await fs.readFile(manifestPath, "utf8");
    manifest = JSON.parse(text) as ExportManifest;
  } catch (err) {
    throw new Error(`import_pack: cannot read manifest at ${manifestPath}: ${(err as Error).message}`);
  }
  if (manifest.schema_version !== 1) {
    throw new Error(
      `import_pack: unsupported manifest schema_version ${manifest.schema_version}`,
    );
  }

  const existing = new Map<string, LoadedEntry>();
  for (const e of await listEntries(projectRoot)) {
    existing.set(e.frontmatter.id, e);
  }

  const plan: ImportPlan = { to_add: [], to_skip: [], to_overwrite: [] };
  const ts = isoDatetime(clock.now());

  for (const m of manifest.entries) {
    if (!isSafeId(m.id)) {
      plan.to_skip.push({ id: m.id, reason: "invalid id" });
      continue;
    }
    if (!ENTRY_KINDS.includes(m.kind)) {
      plan.to_skip.push({ id: m.id, reason: `invalid kind ${m.kind}` });
      continue;
    }
    if (existing.has(m.id)) {
      if (input.overwrite) plan.to_overwrite.push({ id: m.id, kind: m.kind });
      else plan.to_skip.push({ id: m.id, reason: "exists" });
      continue;
    }
    plan.to_add.push({ id: m.id, kind: m.kind });
  }

  if (input.dry_run) {
    return {
      source: sourcePath,
      manifest,
      plan,
      applied: false,
      added: 0,
      overwritten: 0,
    };
  }

  let added = 0;
  let overwritten = 0;
  for (const m of [...plan.to_add, ...plan.to_overwrite]) {
    const file = path.join(sourcePath, "entries", kindToDir(m.kind), `${m.id}.md`);
    const entry = await readEntryFile(file);
    entry.frontmatter.updated_at = ts;
    await writeEntry(projectRoot, entry);
    if (existing.has(m.id)) overwritten++;
    else added++;
  }
  await regenerateIndex(projectRoot, { clock });
  await appendAudit(projectRoot, {
    action: "import_pack",
    actor: "user",
    project_id: manifest.project_id,
    ts,
    note: `import from ${sourcePath}: added=${added}, overwritten=${overwritten}, skipped=${plan.to_skip.length}`,
    ...(input.client_request_id
      ? { client_request_id: input.client_request_id }
      : {}),
  });

  return {
    source: sourcePath,
    manifest,
    plan,
    applied: true,
    added,
    overwritten,
  };
}

// Re-export so the CLI/MCP can identify the .priors root.
export { priorsRoot };
