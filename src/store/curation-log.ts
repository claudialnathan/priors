import { appendLine } from "../util/atomic-write.ts";
import { curationLog } from "./paths.ts";

export type CurationEventKind =
  | "propose"
  | "stage"
  | "edit"
  | "accept"
  | "reject"
  | "discard"
  | "propose_edge"
  | "accept_edge"
  | "discard_edge";

export const CURATION_EVENT_KINDS: readonly CurationEventKind[] = [
  "propose",
  "stage",
  "edit",
  "accept",
  "reject",
  "discard",
  "propose_edge",
  "accept_edge",
  "discard_edge",
] as const;

interface CurationEventBase {
  ts: string;
  source_model: string;
  source_ref: string;
  client_request_id?: string;
  rationale?: string;
}

export interface ProposeEvent extends CurationEventBase {
  kind: "propose";
  candidate_index: number;
  original_payload: unknown;
  sub_scores?: Record<string, number>;
  composite?: number;
}

export interface StageEvent extends CurationEventBase {
  kind: "stage";
  staged_id: string;
  original_payload: unknown;
  grounding_warning?: {
    score: number;
    unsupported_tokens: string[];
  };
}

export interface RejectEvent extends CurationEventBase {
  kind: "reject";
  reason_code: string;
  message: string;
  unsupported_substrings?: string[];
  original_payload: unknown;
  sub_scores?: Record<string, number>;
  composite?: number;
}

export interface AcceptEvent extends CurationEventBase {
  kind: "accept";
  staged_id: string;
  entry_id: string;
  original_payload: unknown;
  edited_payload: unknown | null;
}

export interface EditEvent extends CurationEventBase {
  kind: "edit";
  staged_id: string;
  original_payload: unknown;
  edited_payload: unknown;
}

export interface DiscardEvent extends CurationEventBase {
  kind: "discard";
  staged_id: string;
  original_payload: unknown;
}

export interface ProposeEdgeEvent extends CurationEventBase {
  kind: "propose_edge";
  proposal_id: string;
  edge_source_id: string;
  edge_relation: string;
  edge_target_id: string;
}

export interface AcceptEdgeEvent extends CurationEventBase {
  kind: "accept_edge";
  proposal_id: string;
  edge_source_id: string;
  edge_relation: string;
  edge_target_id: string;
}

export interface DiscardEdgeEvent extends CurationEventBase {
  kind: "discard_edge";
  proposal_id: string;
  edge_source_id: string;
  edge_relation: string;
  edge_target_id: string;
}

export type CurationEvent =
  | ProposeEvent
  | StageEvent
  | RejectEvent
  | AcceptEvent
  | EditEvent
  | DiscardEvent
  | ProposeEdgeEvent
  | AcceptEdgeEvent
  | DiscardEdgeEvent;

export async function appendCurationEvent(
  projectRoot: string,
  event: CurationEvent,
): Promise<void> {
  await appendLine(curationLog(projectRoot), JSON.stringify(event));
}
