import path from "node:path";
import { resolveInside, assertSafeId } from "../util/safe-path.ts";
import type { EntryKind } from "../schema/entry.ts";

const KIND_DIR: Record<EntryKind, string> = {
  decision: "decisions",
  failure: "failures",
  constraint: "constraints",
  pattern: "patterns",
  question: "questions",
  hypothesis: "hypotheses",
};

export function kindToDir(kind: EntryKind): string {
  return KIND_DIR[kind];
}

export function priorsRoot(projectRoot: string): string {
  return path.join(path.resolve(projectRoot), ".priors");
}

export function projectJson(projectRoot: string): string {
  return path.join(priorsRoot(projectRoot), "project.json");
}

export function entriesDir(projectRoot: string): string {
  return path.join(priorsRoot(projectRoot), "entries");
}

export function stagedDir(projectRoot: string): string {
  return path.join(priorsRoot(projectRoot), "staged");
}

export function indexesDir(projectRoot: string): string {
  return path.join(priorsRoot(projectRoot), "indexes");
}

export function indexAllPath(projectRoot: string): string {
  return path.join(indexesDir(projectRoot), "all.json");
}

export function auditDir(projectRoot: string): string {
  return path.join(priorsRoot(projectRoot), "audit");
}

export function auditActionsLog(projectRoot: string): string {
  return path.join(auditDir(projectRoot), "actions.log");
}

export function distillationRejectsLog(projectRoot: string): string {
  return path.join(auditDir(projectRoot), "distillation-rejects.log");
}

export function curationLog(projectRoot: string): string {
  return path.join(auditDir(projectRoot), "curation.log");
}

export function exportsDir(projectRoot: string): string {
  return path.join(priorsRoot(projectRoot), "exports");
}

export function briefMd(projectRoot: string): string {
  return path.join(priorsRoot(projectRoot), "brief.md");
}

export function logMd(projectRoot: string): string {
  return path.join(priorsRoot(projectRoot), "log.md");
}

export function entryPathFor(
  projectRoot: string,
  kind: EntryKind,
  id: string,
): string {
  assertSafeId(id, "entry id");
  const filename = `${id}.md`;
  const rel = path.join("entries", kindToDir(kind), filename);
  return resolveInside(priorsRoot(projectRoot), rel);
}

export function stagedPathFor(projectRoot: string, id: string): string {
  assertSafeId(id, "staged id");
  const rel = path.join("staged", `${id}.md`);
  return resolveInside(priorsRoot(projectRoot), rel);
}

export function relativeFromPriors(
  projectRoot: string,
  absolute: string,
): string {
  const root = priorsRoot(projectRoot);
  const rel = path.relative(root, absolute);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`path is outside .priors root: ${absolute}`);
  }
  return rel.split(path.sep).join("/");
}
