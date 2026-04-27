import fs from "node:fs/promises";
import { auditActionsLog, curationLog, distillationRejectsLog } from "./paths.ts";
import { isSafeId } from "../util/safe-path.ts";

export interface AuditEvent {
  ts: string;
  action: string;
  source: "actions" | "distillation_rejects" | "curation";
  raw: Record<string, unknown>;
}

/**
 * Read the entire audit/actions.log as parsed JSONL records, oldest first.
 * Lines that fail to parse are skipped silently (the log is append-only and
 * may be hand-edited during incident response; we prefer best-effort over
 * total failure).
 */
export async function readActionsLog(
  projectRoot: string,
): Promise<AuditEvent[]> {
  return readJsonl(auditActionsLog(projectRoot), "actions");
}

export async function readDistillationRejectsLog(
  projectRoot: string,
): Promise<AuditEvent[]> {
  return readJsonl(distillationRejectsLog(projectRoot), "distillation_rejects");
}

export async function readCurationLog(
  projectRoot: string,
): Promise<AuditEvent[]> {
  return readJsonl(curationLog(projectRoot), "curation");
}

async function readJsonl(
  filePath: string,
  source: AuditEvent["source"],
): Promise<AuditEvent[]> {
  let text: string;
  try {
    text = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: AuditEvent[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const ts = typeof parsed["ts"] === "string" ? parsed["ts"] : "";
      const action =
        typeof parsed["action"] === "string"
          ? parsed["action"]
          : source === "distillation_rejects"
            ? "distillation_rejected"
            : "unknown";
      out.push({ ts, action, source, raw: parsed });
    } catch {
      continue;
    }
  }
  return out;
}

/**
 * Filter the combined audit logs for events that mention `entryId` in any of
 * the recognized id-bearing fields. Events are returned newest-first.
 */
export async function readAuditForEntry(
  projectRoot: string,
  entryId: string,
): Promise<AuditEvent[]> {
  if (!isSafeId(entryId)) {
    throw new Error(`audit query: invalid entry id ${JSON.stringify(entryId)}`);
  }
  const [actions, rejects] = await Promise.all([
    readActionsLog(projectRoot),
    readDistillationRejectsLog(projectRoot),
  ]);
  const all = [...actions, ...rejects].filter((ev) => mentions(ev, entryId));
  all.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return all;
}

function mentions(ev: AuditEvent, id: string): boolean {
  const r = ev.raw;
  for (const key of [
    "entry_id",
    "staged_id",
    "source_id",
    "target_id",
    "id",
  ]) {
    if (r[key] === id) return true;
  }
  if (
    r["candidate"] &&
    typeof r["candidate"] === "object" &&
    !Array.isArray(r["candidate"]) &&
    (r["candidate"] as Record<string, unknown>)["id"] === id
  ) {
    return true;
  }
  return false;
}
