import fs from "node:fs/promises";
import {
  listEntries,
  listStagedEntries,
  type LoadedEntry,
} from "../store/entries.ts";
import { readProject } from "../store/project.ts";
import {
  indexAllPath,
  priorsRoot,
  projectJson,
} from "../store/paths.ts";
import { regenerateIndex, type IndexDocument } from "../store/index.ts";

export type HealthIssueSeverity = "error" | "warning" | "info";

export interface HealthIssue {
  severity: HealthIssueSeverity;
  code: string;
  message: string;
  entry_id?: string;
}

export interface HealthReport {
  ok: boolean;
  project: { id: string; name: string } | null;
  counts: {
    active: number;
    staged: number;
    superseded: number;
    stale: number;
    contested: number;
  };
  issues: HealthIssue[];
}

const STALE_INDEX_THRESHOLD_MS = 5 * 60 * 1000;

export interface HealthOptions {
  /** When true, regenerate the index in place rather than only reporting. */
  fix?: boolean;
}

export async function runHealthCheck(
  projectRoot: string,
  opts: HealthOptions = {},
): Promise<HealthReport> {
  const issues: HealthIssue[] = [];
  const root = priorsRoot(projectRoot);
  try {
    await fs.access(root);
  } catch {
    return {
      ok: false,
      project: null,
      counts: { active: 0, staged: 0, superseded: 0, stale: 0, contested: 0 },
      issues: [
        {
          severity: "error",
          code: "no_store",
          message: `no .priors store at ${root}; run \`priors init\``,
        },
      ],
    };
  }

  const project = await readProject(projectRoot);
  if (!project) {
    issues.push({
      severity: "error",
      code: "missing_project_json",
      message: `missing or invalid ${projectJson(projectRoot)}`,
    });
  }

  let entries: LoadedEntry[] = [];
  try {
    entries = await listEntries(projectRoot);
  } catch (err) {
    issues.push({
      severity: "error",
      code: "entry_read_failed",
      message: (err as Error).message,
    });
  }

  let staged: LoadedEntry[] = [];
  try {
    staged = await listStagedEntries(projectRoot);
  } catch (err) {
    issues.push({
      severity: "error",
      code: "staged_read_failed",
      message: (err as Error).message,
    });
  }

  const ids = new Set<string>(entries.map((e) => e.frontmatter.id));
  const counts = {
    active: 0,
    staged: staged.length,
    superseded: 0,
    stale: 0,
    contested: 0,
  };
  for (const e of entries) {
    switch (e.frontmatter.status) {
      case "active":
      case "action_pending":
        counts.active++;
        break;
      case "superseded":
        counts.superseded++;
        break;
      case "stale":
        counts.stale++;
        break;
      case "contested":
        counts.contested++;
        break;
    }
    for (const rel of [
      "supersedes",
      "contradiction_of",
      "derived_from",
      "reinforces",
      "caused_by",
      "blocks",
      "depends_on",
      "refutes",
    ] as const) {
      for (const target of e.frontmatter.relations[rel]) {
        if (!ids.has(target)) {
          issues.push({
            severity: "warning",
            code: "broken_relation",
            entry_id: e.frontmatter.id,
            message: `relations.${rel} → ${target} (target not found)`,
          });
        }
      }
    }
    if (
      e.frontmatter.status === "stale" &&
      (!e.frontmatter.stale_reason || e.frontmatter.stale_reason.trim().length === 0)
    ) {
      issues.push({
        severity: "warning",
        code: "stale_without_reason",
        entry_id: e.frontmatter.id,
        message: "entry is stale but has no stale_reason",
      });
    }
  }

  for (const s of staged) {
    const created = Date.parse(s.frontmatter.created_at);
    if (!Number.isNaN(created)) {
      const ageDays = (Date.now() - created) / (24 * 60 * 60 * 1000);
      if (ageDays > 90) {
        issues.push({
          severity: "warning",
          code: "stale_staged",
          entry_id: s.frontmatter.id,
          message: `staged entry has been pending ${Math.round(ageDays)} days`,
        });
      }
    }
  }

  let indexDoc: IndexDocument | null = null;
  try {
    const text = await fs.readFile(indexAllPath(projectRoot), "utf8");
    indexDoc = JSON.parse(text) as IndexDocument;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      issues.push({
        severity: "warning",
        code: "missing_index",
        message:
          "indexes/all.json is missing; run `priors health --fix` or any write tool to regenerate",
      });
    } else {
      issues.push({
        severity: "error",
        code: "index_unreadable",
        message: (err as Error).message,
      });
    }
  }
  if (indexDoc) {
    if (indexDoc.entries.length !== entries.length) {
      issues.push({
        severity: "warning",
        code: "index_stale",
        message: `index has ${indexDoc.entries.length} rows; on-disk active entries: ${entries.length}`,
      });
    }
    const generated = Date.parse(indexDoc.generated_at);
    if (
      !Number.isNaN(generated) &&
      Date.now() - generated > STALE_INDEX_THRESHOLD_MS &&
      indexDoc.entries.length !== entries.length
    ) {
      issues.push({
        severity: "info",
        code: "index_old",
        message: `index last regenerated at ${indexDoc.generated_at}`,
      });
    }
  }

  if (opts.fix) {
    try {
      await regenerateIndex(projectRoot);
    } catch (err) {
      issues.push({
        severity: "error",
        code: "regenerate_failed",
        message: (err as Error).message,
      });
    }
  }

  const ok = !issues.some((i) => i.severity === "error");
  return {
    ok,
    project: project ? { id: project.id, name: project.name } : null,
    counts,
    issues,
  };
}
