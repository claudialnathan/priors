/**
 * One-shot migration from the legacy 4-relation vocabulary to the v1 8-kind
 * vocabulary. The only on-disk rename is `contradicts` → `contradiction_of`;
 * `reinforces` and `derived_from` carry over unchanged. New kinds
 * (`caused_by`, `blocks`, `depends_on`, `refutes`) start empty.
 *
 * The migration intentionally bypasses validateEntryFrontmatter — it has to
 * read entries that the new schema would reject. Reads via raw YAML, mutates
 * the relations map, writes back atomically.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { parseFrontmatter, serializeFrontmatter, type YamlValue } from "../util/yaml.ts";
import { atomicWrite } from "../util/atomic-write.ts";
import { entriesDir, kindToDir, stagedDir } from "./paths.ts";
import { isoDatetime, systemClock, type Clock } from "../util/clock.ts";
import { appendAudit } from "./audit.ts";
import { ENTRY_KINDS } from "../schema/entry.ts";
import { regenerateIndex } from "./index.ts";

const NEW_KEYS = [
  "caused_by",
  "blocks",
  "depends_on",
  "refutes",
] as const;

export interface MigrationResult {
  scanned: number;
  rewritten: number;
  dryRun: boolean;
  files: Array<{ path: string; changes: string[] }>;
}

export async function migrateRelations(
  projectRoot: string,
  opts: { dryRun?: boolean; clock?: Clock } = {},
): Promise<MigrationResult> {
  const dryRun = opts.dryRun ?? false;
  const clock = opts.clock ?? systemClock;
  const result: MigrationResult = {
    scanned: 0,
    rewritten: 0,
    dryRun,
    files: [],
  };

  const candidates: string[] = [];
  for (const kind of ENTRY_KINDS) {
    const dir = path.join(entriesDir(projectRoot), kindToDir(kind));
    candidates.push(...(await listMarkdown(dir)));
  }
  candidates.push(...(await listMarkdown(stagedDir(projectRoot))));

  for (const file of candidates) {
    result.scanned++;
    const text = await fs.readFile(file, "utf8");
    let frontmatter;
    try {
      frontmatter = parseFrontmatter(text);
    } catch {
      continue;
    }
    const data = frontmatter.data;
    const relations = data["relations"];
    if (!relations || typeof relations !== "object" || Array.isArray(relations)) {
      continue;
    }
    const r = relations as { [k: string]: YamlValue };
    const changes: string[] = [];

    if (Array.isArray(r["contradicts"])) {
      r["contradiction_of"] = [
        ...((r["contradiction_of"] as YamlValue[] | undefined) ?? []),
        ...(r["contradicts"] as YamlValue[]),
      ];
      delete r["contradicts"];
      changes.push("contradicts → contradiction_of");
    }
    for (const k of NEW_KEYS) {
      if (r[k] === undefined) {
        r[k] = [];
        changes.push(`+${k}`);
      }
    }

    if (changes.length === 0) continue;
    result.rewritten++;
    result.files.push({ path: file, changes });

    if (!dryRun) {
      const serialized = serializeFrontmatter(data, frontmatter.body);
      await atomicWrite(file, serialized);
    }
  }

  if (!dryRun && result.rewritten > 0) {
    await regenerateIndex(projectRoot, { clock });
    await appendAudit(projectRoot, {
      action: "migrate_relations",
      actor: "tool",
      ts: isoDatetime(clock.now()),
      note: `rewrote ${result.rewritten} of ${result.scanned} entries`,
    });
  }

  return result;
}

async function listMarkdown(dir: string): Promise<string[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return names
    .filter((n) => n.endsWith(".md"))
    .map((n) => path.join(dir, n));
}
