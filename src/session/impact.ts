/**
 * /impact: did Priors actually make this session better?
 *
 * Reads session.jsonl events and produces a non-technical report. Pure
 * function on the event list, so the formatter is testable.
 */

import type { SessionEvent } from "./log.ts";

export interface ImpactReport {
  sessionId: string;
  recallsUsed: { reference: string; title: string }[];
  pushbacks: { reference: string; title: string; reason: string }[];
  rulesApplied: { reference: string; title: string }[];
  candidatesProposed: number;
  candidatesLogged: number;
  candidatesSkipped: number;
  userLogIntents: number;
  possibleMisses: string[];
}

export function buildImpactReport(events: readonly SessionEvent[]): ImpactReport {
  const sessionId = events.find((e) => e.session_id)?.session_id ?? "(unknown)";
  const recallSeen = new Set<string>();
  const recallsUsed: ImpactReport["recallsUsed"] = [];
  const pushbacks: ImpactReport["pushbacks"] = [];
  const ruleSeen = new Set<string>();
  const rulesApplied: ImpactReport["rulesApplied"] = [];
  let candidatesProposed = 0;
  let candidatesLogged = 0;
  let candidatesSkipped = 0;
  let userLogIntents = 0;

  for (const ev of events) {
    switch (ev.kind) {
      case "recall": {
        const refs = (ev.payload["entries"] as { reference?: string; title?: string }[] | undefined) ?? [];
        for (const r of refs) {
          if (!r.reference || recallSeen.has(r.reference)) continue;
          recallSeen.add(r.reference);
          recallsUsed.push({ reference: r.reference, title: r.title ?? "" });
        }
        break;
      }
      case "pushback":
        pushbacks.push({
          reference: String(ev.payload["reference"] ?? ""),
          title: String(ev.payload["title"] ?? ""),
          reason: String(ev.payload["reason"] ?? ""),
        });
        break;
      case "rule_applied": {
        const ref = String(ev.payload["reference"] ?? "");
        if (!ref || ruleSeen.has(ref)) break;
        ruleSeen.add(ref);
        rulesApplied.push({ reference: ref, title: String(ev.payload["title"] ?? "") });
        break;
      }
      case "candidate_proposed":
        candidatesProposed++;
        break;
      case "candidate_logged":
        candidatesLogged++;
        break;
      case "candidate_skipped":
        candidatesSkipped++;
        break;
      case "user_log_intent":
        userLogIntents++;
        break;
      default:
        break;
    }
  }

  const possibleMisses: string[] = [];
  if (userLogIntents > candidatesLogged + candidatesProposed) {
    possibleMisses.push(
      `${userLogIntents} user log intent(s) detected but only ${candidatesLogged} logged + ${candidatesProposed} proposed`,
    );
  }
  if (recallsUsed.length === 0 && events.length > 5) {
    possibleMisses.push("session ran for several events but no recall was performed");
  }

  return {
    sessionId,
    recallsUsed,
    pushbacks,
    rulesApplied,
    candidatesProposed,
    candidatesLogged,
    candidatesSkipped,
    userLogIntents,
    possibleMisses,
  };
}

export function renderImpactReport(report: ImpactReport): string {
  const lines: string[] = [];
  lines.push(`Priors impact this session (${report.sessionId}):`);
  lines.push("");

  let n = 1;
  if (report.pushbacks.length > 0) {
    for (const p of report.pushbacks) {
      lines.push(`${n}. Pushback`);
      lines.push(`   ${p.reference} — ${p.title}`);
      if (p.reason) lines.push(`   Reason: ${p.reason}`);
      n++;
    }
  }
  if (report.rulesApplied.length > 0) {
    for (const r of report.rulesApplied) {
      lines.push(`${n}. Applied rule`);
      lines.push(`   ${r.reference} — ${r.title}`);
      n++;
    }
  }
  if (report.recallsUsed.length > 0) {
    lines.push(`${n}. Relevant priors recalled`);
    for (const r of report.recallsUsed) {
      lines.push(`   - ${r.reference}: ${r.title}`);
    }
    n++;
  }
  if (report.candidatesLogged + report.candidatesProposed + report.candidatesSkipped > 0) {
    lines.push(`${n}. Candidates`);
    lines.push(`   logged: ${report.candidatesLogged}, proposed: ${report.candidatesProposed}, skipped: ${report.candidatesSkipped}`);
    n++;
  }
  if (report.possibleMisses.length > 0) {
    lines.push(`${n}. Possible misses`);
    for (const m of report.possibleMisses) lines.push(`   - ${m}`);
    n++;
  }
  if (lines.length === 2) {
    lines.push("(no Priors activity recorded for this session)");
  }
  return lines.join("\n");
}
