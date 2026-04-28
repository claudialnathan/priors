/**
 * Session log: per-session JSONL trail of recalls, pushbacks, applied rules,
 * and candidate proposals. The /why and /impact surfaces read this file.
 *
 * The log is append-only and bounded — entries older than `MAX_AGE_DAYS` are
 * trimmed by /reflect. The file lives at .priors/audit/session.jsonl so it
 * coexists with the existing append-only logs.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { auditDir } from "../store/paths.ts";
import { ensureDir } from "../util/atomic-write.ts";
import { isoDatetime, systemClock, type Clock } from "../util/clock.ts";

export const SESSION_LOG_FILENAME = "session.jsonl";

export type SessionEventKind =
  | "session_start"
  | "session_end"
  | "recall"
  | "pushback"
  | "rule_applied"
  | "candidate_proposed"
  | "candidate_logged"
  | "candidate_skipped"
  | "user_log_intent";

export interface SessionEvent {
  ts: string;
  session_id: string;
  kind: SessionEventKind;
  /** Free-form payload. Keep small; this file is read often. */
  payload: Record<string, unknown>;
}

export function sessionLogPath(projectRoot: string): string {
  return path.join(auditDir(projectRoot), SESSION_LOG_FILENAME);
}

export async function appendSessionEvent(
  projectRoot: string,
  event: Omit<SessionEvent, "ts"> & { ts?: string },
  opts: { clock?: Clock } = {},
): Promise<void> {
  const clock = opts.clock ?? systemClock;
  await ensureDir(auditDir(projectRoot));
  const record: SessionEvent = {
    ts: event.ts ?? isoDatetime(clock.now()),
    session_id: event.session_id,
    kind: event.kind,
    payload: event.payload,
  };
  await fs.appendFile(sessionLogPath(projectRoot), `${JSON.stringify(record)}\n`);
}

export async function readSessionEvents(
  projectRoot: string,
  filter?: { sessionId?: string; sinceIso?: string },
): Promise<SessionEvent[]> {
  let text: string;
  try {
    text = await fs.readFile(sessionLogPath(projectRoot), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: SessionEvent[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: SessionEvent;
    try {
      parsed = JSON.parse(trimmed) as SessionEvent;
    } catch {
      continue;
    }
    if (filter?.sessionId && parsed.session_id !== filter.sessionId) continue;
    if (filter?.sinceIso && parsed.ts < filter.sinceIso) continue;
    out.push(parsed);
  }
  return out;
}
