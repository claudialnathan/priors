/**
 * /log: force a memory entry from user-supplied text. This is the natural-
 * language counterpart of /rule add — when the user explicitly says "log
 * this," we trust the user authored the claim and write directly. The
 * significance gate still runs as a safety net (refusing empty / noise-only
 * claims) but the user-explicit signal lets it through.
 */

import { detectLogIntent, type LogIntentKind } from "../intent/log-intent.ts";
import { classifySignificance } from "../intent/significance.ts";
import {
  emptyRelations,
  type EntryConfidence,
  type EntryFrontmatter,
  type EntryKind,
} from "../schema/entry.ts";
import { listEntries, makeFrontmatter, writeEntry } from "../store/entries.ts";
import { isoDate, isoDatetime, systemClock, type Clock } from "../util/clock.ts";
import { nextReadableId } from "../util/readable-id.ts";
import { regenerateIndex } from "../store/index.ts";
import { appendAudit } from "../store/audit.ts";

export interface UserLogInput {
  /** The claim to log — already in agent voice, NOT raw user emotion. */
  claim: string;
  /** Optional explicit kind. If omitted we infer from `text` or default to "decision". */
  kind?: EntryKind;
  /** The original user phrase so /reflect can audit later if needed. */
  user_text?: string;
  /** Optional rationale that becomes the entry body. */
  rationale?: string;
  /** Caller-supplied tags. */
  tags?: string[];
  /** Confidence label. Default: medium for /log; rules use addUserRule. */
  confidence?: EntryConfidence;
  /** Idempotency key. */
  client_request_id?: string;
  /** ISO datetime override (testing). */
  ts?: string;
}

export interface UserLogResult {
  id: string;
  readable_id: string;
  kind: EntryKind;
  path: string;
  claim: string;
}

export async function userLog(
  projectRoot: string,
  input: UserLogInput,
  opts: { clock?: Clock } = {},
): Promise<UserLogResult> {
  const clock = opts.clock ?? systemClock;
  const claim = input.claim.trim();
  if (!claim) throw new Error("/log: claim must be non-empty");
  if (claim.length > 280) {
    throw new Error(`/log: claim must be ≤ 280 characters (got ${claim.length})`);
  }

  let kind: EntryKind = input.kind ?? "decision";
  if (!input.kind && input.user_text) {
    const intent = detectLogIntent(input.user_text);
    if (intent.matched) {
      kind = mapIntentKind(intent.suggestedKind, kind);
    }
  }

  // Even on user-explicit asks, run the gate so empty / pure-noise claims fail closed.
  const verdict = classifySignificance({
    claim,
    kind,
    signals: { userExplicit: true, hasEvidence: Boolean(input.user_text) },
  });
  if (verdict.decision === "skip") {
    throw new Error(`/log: significance gate refused — ${verdict.reasons.join("; ")}`);
  }

  const today = isoDate(clock.now());
  const ts = input.ts ?? isoDatetime(clock.now());

  const all = await listEntries(projectRoot);
  const existingForReadable = all.map((e) => ({
    kind: e.frontmatter.kind,
    readable_id: e.frontmatter.readable_id,
  }));
  const readableId = nextReadableId(kind, existingForReadable);

  const id = `userlog-${today.replaceAll("-", "")}-${readableId.toLowerCase()}`;

  const tags = Array.from(new Set([...(input.tags ?? []), "user-logged"]));

  const fm: EntryFrontmatter = makeFrontmatter(
    id,
    kind,
    claim,
    today,
    ts,
    ts,
    {
      status: "active",
      confidence: input.confidence ?? "medium",
      relations: emptyRelations(),
      tags,
    },
  );
  fm.readable_id = readableId;
  fm.author = "user";

  const body = renderBody(claim, input.user_text, input.rationale);
  const location = await writeEntry(projectRoot, { frontmatter: fm, body });

  await regenerateIndex(projectRoot, { clock });
  await appendAudit(projectRoot, {
    action: "user_log",
    actor: "user",
    entry_id: id,
    readable_id: readableId,
    kind,
    ts,
    ...(input.client_request_id ? { client_request_id: input.client_request_id } : {}),
  });

  return { id, readable_id: readableId, kind, path: location.relativePath, claim };
}

function mapIntentKind(intent: LogIntentKind, fallback: EntryKind): EntryKind {
  if (intent === "note") return fallback;
  return intent;
}

function renderBody(claim: string, userText?: string, rationale?: string): string {
  const lines: string[] = [];
  lines.push("## Claim");
  lines.push("");
  lines.push(claim);
  if (rationale) {
    lines.push("");
    lines.push("## Rationale");
    lines.push("");
    lines.push(rationale.trim());
  }
  if (userText && userText.trim() !== claim) {
    lines.push("");
    lines.push("## Source phrase");
    lines.push("");
    lines.push("> " + userText.trim().replaceAll("\n", "\n> "));
  }
  return lines.join("\n");
}
