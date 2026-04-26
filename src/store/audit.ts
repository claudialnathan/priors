import { appendLine } from "../util/atomic-write.ts";
import { auditActionsLog, distillationRejectsLog } from "./paths.ts";

export interface AuditRecord {
  ts: string;
  action: string;
  actor: string;
  project_id?: string;
  entry_id?: string;
  staged_id?: string;
  kind?: string;
  source_id?: string;
  target_id?: string;
  relation?: string;
  client_request_id?: string;
  reason?: string;
  note?: string;
  [k: string]: string | number | boolean | undefined;
}

export async function appendAudit(
  projectRoot: string,
  record: AuditRecord,
): Promise<void> {
  await appendLine(auditActionsLog(projectRoot), JSON.stringify(record));
}

export interface DistillationReject {
  ts: string;
  source_ref: string;
  reason_code:
    | "quote_not_in_source"
    | "forbidden_kind"
    | "claim_too_long"
    | "evidence_count_invalid"
    | "reasoning_too_long"
    | "duplicate_of_active";
  message: string;
  candidate?: unknown;
  client_request_id?: string;
}

export async function appendRejection(
  projectRoot: string,
  record: DistillationReject,
): Promise<void> {
  await appendLine(distillationRejectsLog(projectRoot), JSON.stringify(record));
}
