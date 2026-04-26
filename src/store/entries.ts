import fs from "node:fs/promises";
import path from "node:path";
import {
  parseFrontmatter,
  serializeFrontmatter,
  type YamlValue,
} from "../util/yaml.ts";
import { atomicWrite, ensureDir } from "../util/atomic-write.ts";
import { isSafeId } from "../util/safe-path.ts";
import {
  entriesDir,
  entryPathFor,
  kindToDir,
  priorsRoot,
  relativeFromPriors,
  stagedDir,
  stagedPathFor,
} from "./paths.ts";
import {
  ENTRY_KINDS,
  emptyRelations,
  validateEntryFrontmatter,
  type Entry,
  type EntryFrontmatter,
  type EntryKind,
} from "../schema/entry.ts";

export interface EntryLocation {
  /** Absolute path to the entry markdown file. */
  filePath: string;
  /** Relative path under .priors/ (forward-slash). */
  relativePath: string;
  /** Whether the entry lives in `entries/` (active) or `staged/`. */
  area: "entries" | "staged";
}

export interface LoadedEntry extends Entry {
  location: EntryLocation;
}

export async function readEntryFile(filePath: string): Promise<Entry> {
  const text = await fs.readFile(filePath, "utf8");
  const { data, body } = parseFrontmatter(text);
  const v = validateEntryFrontmatter(data);
  if (!v.ok) {
    throw new Error(
      `invalid entry frontmatter at ${filePath}:\n  - ${v.errors.join("\n  - ")}`,
    );
  }
  return { frontmatter: v.value, body };
}

export function entryToFileText(entry: Entry): string {
  const fm = entry.frontmatter;
  const data: { [k: string]: YamlValue } = {
    id: fm.id,
    kind: fm.kind,
    status: fm.status,
    confidence: fm.confidence,
    as_of: fm.as_of,
    created_at: fm.created_at,
    updated_at: fm.updated_at,
    claim: fm.claim,
    relations: {
      supersedes: [...fm.relations.supersedes],
      contradicts: [...fm.relations.contradicts],
      reinforces: [...fm.relations.reinforces],
      derived_from: [...fm.relations.derived_from],
    },
    tags: [...fm.tags],
  };
  if (fm.source_ref !== undefined) data["source_ref"] = fm.source_ref;
  if (fm.stale_reason !== undefined) data["stale_reason"] = fm.stale_reason;
  let body = entry.body;
  if (!body.startsWith("\n")) body = `\n${body}`;
  if (!body.endsWith("\n")) body = `${body}\n`;
  return serializeFrontmatter(data, body);
}

export async function writeEntry(
  projectRoot: string,
  entry: Entry,
): Promise<EntryLocation> {
  const filePath = entryPathFor(
    projectRoot,
    entry.frontmatter.kind,
    entry.frontmatter.id,
  );
  await ensureDir(path.dirname(filePath));
  await atomicWrite(filePath, entryToFileText(entry));
  return {
    filePath,
    relativePath: relativeFromPriors(projectRoot, filePath),
    area: "entries",
  };
}

export async function writeStagedEntry(
  projectRoot: string,
  entry: Entry,
): Promise<EntryLocation> {
  const filePath = stagedPathFor(projectRoot, entry.frontmatter.id);
  await ensureDir(path.dirname(filePath));
  await atomicWrite(filePath, entryToFileText(entry));
  return {
    filePath,
    relativePath: relativeFromPriors(projectRoot, filePath),
    area: "staged",
  };
}

export async function readStagedEntry(
  projectRoot: string,
  id: string,
): Promise<LoadedEntry | null> {
  const filePath = stagedPathFor(projectRoot, id);
  try {
    const entry = await readEntryFile(filePath);
    return {
      ...entry,
      location: {
        filePath,
        relativePath: relativeFromPriors(projectRoot, filePath),
        area: "staged",
      },
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function deleteStagedEntry(
  projectRoot: string,
  id: string,
): Promise<void> {
  const filePath = stagedPathFor(projectRoot, id);
  await fs.rm(filePath, { force: true });
}

export async function listEntries(
  projectRoot: string,
): Promise<LoadedEntry[]> {
  const root = entriesDir(projectRoot);
  const out: LoadedEntry[] = [];
  for (const kind of ENTRY_KINDS) {
    const dir = path.join(root, kindToDir(kind));
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    for (const name of names) {
      if (!name.endsWith(".md")) continue;
      const id = name.slice(0, -3);
      if (!isSafeId(id)) continue;
      const filePath = path.join(dir, name);
      const entry = await readEntryFile(filePath);
      if (entry.frontmatter.kind !== kind) {
        throw new Error(
          `entry ${id} is in directory ${kindToDir(kind)} but kind is ${entry.frontmatter.kind}`,
        );
      }
      out.push({
        ...entry,
        location: {
          filePath,
          relativePath: relativeFromPriors(projectRoot, filePath),
          area: "entries",
        },
      });
    }
  }
  out.sort((a, b) =>
    a.frontmatter.id < b.frontmatter.id ? -1 : a.frontmatter.id > b.frontmatter.id ? 1 : 0,
  );
  return out;
}

export async function listStagedEntries(
  projectRoot: string,
): Promise<LoadedEntry[]> {
  const dir = stagedDir(projectRoot);
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: LoadedEntry[] = [];
  for (const name of names) {
    if (!name.endsWith(".md")) continue;
    const id = name.slice(0, -3);
    if (!isSafeId(id)) continue;
    const filePath = path.join(dir, name);
    const entry = await readEntryFile(filePath);
    out.push({
      ...entry,
      location: {
        filePath,
        relativePath: relativeFromPriors(projectRoot, filePath),
        area: "staged",
      },
    });
  }
  out.sort((a, b) =>
    a.frontmatter.id < b.frontmatter.id ? -1 : a.frontmatter.id > b.frontmatter.id ? 1 : 0,
  );
  return out;
}

export async function findEntryById(
  projectRoot: string,
  id: string,
): Promise<LoadedEntry | null> {
  if (!isSafeId(id)) return null;
  for (const kind of ENTRY_KINDS) {
    const filePath = path.join(
      entriesDir(projectRoot),
      kindToDir(kind),
      `${id}.md`,
    );
    try {
      await fs.access(filePath);
      const entry = await readEntryFile(filePath);
      return {
        ...entry,
        location: {
          filePath,
          relativePath: relativeFromPriors(projectRoot, filePath),
          area: "entries",
        },
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  return null;
}

export function makeFrontmatter(
  id: string,
  kind: EntryKind,
  claim: string,
  asOf: string,
  createdAt: string,
  updatedAt: string,
  options: Partial<Omit<EntryFrontmatter, "id" | "kind" | "claim" | "as_of" | "created_at" | "updated_at">> = {},
): EntryFrontmatter {
  return {
    id,
    kind,
    claim,
    as_of: asOf,
    created_at: createdAt,
    updated_at: updatedAt,
    status: options.status ?? "active",
    confidence: options.confidence ?? "medium",
    relations: options.relations ?? emptyRelations(),
    tags: options.tags ?? [],
    ...(options.source_ref !== undefined ? { source_ref: options.source_ref } : {}),
    ...(options.stale_reason !== undefined ? { stale_reason: options.stale_reason } : {}),
  };
}

// path utilities re-exported for callers
export { priorsRoot, relativeFromPriors };
