/**
 * Rules: a separate human-facing surface on top of entries with kind=rule.
 *
 * User-authored rules write directly (no quote-or-refuse), which is safe
 * because the human typed the claim. Agent-authored or agent-inferred rules
 * still flow through stage_learning. Rules carry priority and an `author`
 * field so /reflect can spot agent-authored "high" rules that overstate
 * certainty.
 */

import {
  emptyRelations,
  type EntryConfidence,
  type EntryFrontmatter,
  type EntryPriority,
} from "../schema/entry.ts";
import { listEntries, makeFrontmatter, writeEntry } from "../store/entries.ts";
import { isoDate, isoDatetime, systemClock, type Clock } from "../util/clock.ts";
import { nextReadableId } from "../util/readable-id.ts";
import { regenerateIndex } from "../store/index.ts";
import { appendAudit } from "../store/audit.ts";

export interface AddUserRuleInput {
  /** One-line rule text (≤ 280 chars). */
  claim: string;
  /** Optional area: coding, research, product, agent-conduct, project-management, handover. */
  area?: string;
  /** Priority hint. Default: high (user-authored rules are typically deliberate). */
  priority?: EntryPriority;
  /** Confidence label. Default: high (user is the author). */
  confidence?: EntryConfidence;
  /** Optional rationale that becomes the entry body. */
  rationale?: string;
  /** Caller-supplied tags. `area` and `user-authored` are added automatically. */
  tags?: string[];
  /** Idempotency key. */
  client_request_id?: string;
}

export interface AddUserRuleResult {
  id: string;
  readable_id: string;
  path: string;
  claim: string;
}

/**
 * Add a user-authored rule. Direct write — does NOT go through stage_learning
 * because the user is typing the claim themselves; quote-or-refuse exists to
 * protect against agent hallucination, not to gate human input.
 */
export async function addUserRule(
  projectRoot: string,
  input: AddUserRuleInput,
  opts: { clock?: Clock } = {},
): Promise<AddUserRuleResult> {
  const clock = opts.clock ?? systemClock;
  const claim = input.claim.trim();
  if (!claim) throw new Error("rule claim must be non-empty");
  if (claim.length > 280) {
    throw new Error(`rule claim must be ≤ 280 characters (got ${claim.length})`);
  }

  const today = isoDate(clock.now());
  const ts = isoDatetime(clock.now());

  const all = await listEntries(projectRoot);
  const existingForReadable = all.map((e) => ({
    kind: e.frontmatter.kind,
    readable_id: e.frontmatter.readable_id,
  }));
  const readableId = nextReadableId("rule", existingForReadable);

  const id = `rule-${today.replaceAll("-", "")}-${readableId.toLowerCase()}`;

  const tags = Array.from(new Set([
    ...(input.tags ?? []),
    "user-authored",
    ...(input.area ? [`area:${input.area}`] : []),
  ]));

  const fm: EntryFrontmatter = makeFrontmatter(
    id,
    "rule",
    claim,
    today,
    ts,
    ts,
    {
      status: "active",
      confidence: input.confidence ?? "high",
      relations: emptyRelations(),
      tags,
    },
  );
  fm.readable_id = readableId;
  fm.author = "user";
  fm.priority = input.priority ?? "high";

  const body = renderRuleBody(claim, input.area, input.rationale);
  const location = await writeEntry(projectRoot, { frontmatter: fm, body });

  await regenerateIndex(projectRoot, { clock });
  await appendAudit(projectRoot, {
    action: "rule_add",
    actor: "user",
    entry_id: id,
    readable_id: readableId,
    ts,
    ...(input.client_request_id ? { client_request_id: input.client_request_id } : {}),
  });

  return {
    id,
    readable_id: readableId,
    path: location.relativePath,
    claim,
  };
}

function renderRuleBody(claim: string, area: string | undefined, rationale: string | undefined): string {
  const lines: string[] = [];
  lines.push("## Rule");
  lines.push("");
  lines.push(claim);
  if (area) {
    lines.push("");
    lines.push(`Area: ${area}`);
  }
  if (rationale) {
    lines.push("");
    lines.push("## Rationale");
    lines.push("");
    lines.push(rationale.trim());
  }
  return lines.join("\n");
}

/**
 * Return active rules from the store, sorted by priority then readable id.
 */
export async function listRules(projectRoot: string): Promise<{
  id: string;
  readable_id: string;
  claim: string;
  priority: EntryPriority;
  area?: string;
  author: "user" | "agent";
  as_of: string;
}[]> {
  const all = await listEntries(projectRoot);
  const out: Awaited<ReturnType<typeof listRules>> = [];
  for (const e of all) {
    const fm = e.frontmatter;
    if (fm.kind !== "rule") continue;
    if (fm.status !== "active") continue;
    const area = fm.tags.find((t) => t.startsWith("area:"))?.slice(5);
    const result: {
      id: string;
      readable_id: string;
      claim: string;
      priority: EntryPriority;
      author: "user" | "agent";
      as_of: string;
      area?: string;
    } = {
      id: fm.id,
      readable_id: fm.readable_id ?? fm.id,
      claim: fm.claim,
      priority: fm.priority ?? "medium",
      author: fm.author ?? "agent",
      as_of: fm.as_of,
    };
    if (area) result.area = area;
    out.push(result);
  }
  const priOrder: Record<EntryPriority, number> = { high: 0, medium: 1, low: 2 };
  out.sort((a, b) => {
    const pa = priOrder[a.priority];
    const pb = priOrder[b.priority];
    if (pa !== pb) return pa - pb;
    return a.readable_id < b.readable_id ? -1 : a.readable_id > b.readable_id ? 1 : 0;
  });
  return out;
}
