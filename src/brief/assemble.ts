import { approxTokens } from "../util/tokens.ts";
import { isoDatetime, systemClock, type Clock } from "../util/clock.ts";
import {
  listEntries,
  listStagedEntries,
  type LoadedEntry,
} from "../store/entries.ts";
import { requireProject } from "../store/project.ts";

const TOTAL_CEILING = 2000;
const SECTION_BUDGETS = {
  header: 80,
  current_state: 120,
  active_decisions: 350,
  active_constraints: 300,
  open_questions: 200,
  contested: 200,
  recently_superseded: 250,
  dead_ends: 250,
  next_moves: 150,
  footer: 80,
} as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface AssembleOptions {
  clock?: Clock;
}

export interface BriefResult {
  text: string;
  /** Approximate token counts per section (for diagnostics and tests). */
  tokens: Record<keyof typeof SECTION_BUDGETS, number>;
  /** Total approximate tokens. */
  totalTokens: number;
}

export async function assembleBrief(
  projectRoot: string,
  opts: AssembleOptions = {},
): Promise<BriefResult> {
  const clock = opts.clock ?? systemClock;
  const meta = await requireProject(projectRoot);
  const entries = await listEntries(projectRoot);
  const staged = await listStagedEntries(projectRoot);
  const supersededSnapshots = collectSupersededSnapshots(entries);

  const generatedAt = clock.now();
  const generatedIso = formatGenerated(generatedAt);
  const lastActivity = computeLastActivity(entries, generatedAt);
  const counts = countTotals(entries);

  const sections: Array<{
    name: keyof typeof SECTION_BUDGETS;
    text: string;
  }> = [];

  sections.push({
    name: "header",
    text: renderHeader(
      meta.name,
      meta.id,
      generatedIso,
      lastActivity,
      counts.active,
      staged.length,
      counts.superseded,
    ),
  });

  sections.push({
    name: "current_state",
    text: renderCurrentState(entries, SECTION_BUDGETS.current_state),
  });

  sections.push({
    name: "active_decisions",
    text: renderActiveDecisions(entries, SECTION_BUDGETS.active_decisions),
  });

  sections.push({
    name: "active_constraints",
    text: renderActiveConstraints(
      entries,
      SECTION_BUDGETS.active_constraints,
    ),
  });

  sections.push({
    name: "open_questions",
    text: renderOpenQuestions(entries, SECTION_BUDGETS.open_questions),
  });

  sections.push({
    name: "contested",
    text: renderContested(entries, SECTION_BUDGETS.contested),
  });

  sections.push({
    name: "recently_superseded",
    text: renderRecentlySuperseded(
      entries,
      supersededSnapshots,
      generatedAt,
      SECTION_BUDGETS.recently_superseded,
    ),
  });

  sections.push({
    name: "dead_ends",
    text: renderDeadEnds(entries, generatedAt, SECTION_BUDGETS.dead_ends),
  });

  sections.push({
    name: "next_moves",
    text: renderNextMoves(entries, SECTION_BUDGETS.next_moves),
  });

  const stagedWarn = stagedBacklogWarning(staged, generatedAt);
  const footerText = renderFooter(stagedWarn);
  sections.push({ name: "footer", text: footerText });

  const text = sections.map((s) => s.text).join("\n\n").trimEnd() + "\n";
  const tokens = Object.fromEntries(
    sections.map((s) => [s.name, approxTokens(s.text)]),
  ) as BriefResult["tokens"];
  const totalTokens = Object.values(tokens).reduce((a, b) => a + b, 0);

  if (totalTokens > TOTAL_CEILING) {
    throw new Error(
      `brief assembly exceeded total token ceiling: ${totalTokens} > ${TOTAL_CEILING}`,
    );
  }

  return { text, tokens, totalTokens };
}

function formatGenerated(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const HH = String(d.getUTCHours()).padStart(2, "0");
  const MM = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${HH}:${MM} UTC`;
}

function computeLastActivity(entries: LoadedEntry[], now: Date): string {
  if (entries.length === 0) return "never";
  const latestIso = entries
    .map((e) => e.frontmatter.updated_at)
    .sort()
    .at(-1)!;
  const latestMs = Date.parse(latestIso);
  const diffMs = now.getTime() - latestMs;
  if (diffMs < 0) return "moments ago";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "moments ago";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function countTotals(entries: LoadedEntry[]): {
  active: number;
  superseded: number;
} {
  let active = 0;
  let superseded = 0;
  for (const e of entries) {
    switch (e.frontmatter.status) {
      case "active":
      case "action_pending":
      case "contested":
        active++;
        break;
      case "superseded":
        superseded++;
        break;
      case "stale":
        break;
    }
  }
  return { active, superseded };
}

function renderHeader(
  name: string,
  id: string,
  generated: string,
  lastActivity: string,
  active: number,
  staged: number,
  superseded: number,
): string {
  const lines = [
    "# Project trajectory brief",
    `Project: ${name} (id: ${id})`,
    `Generated: ${generated}`,
    `Last activity: ${lastActivity}`,
    `Total entries: ${active} active, ${staged} staged, ${superseded} superseded`,
  ];
  return truncateToBudget(lines.join("\n"), SECTION_BUDGETS.header);
}

function renderCurrentState(entries: LoadedEntry[], budget: number): string {
  const candidates = entries
    .filter(
      (e) =>
        e.frontmatter.status === "active" &&
        e.frontmatter.tags.includes("state"),
    )
    .sort((a, b) =>
      a.frontmatter.updated_at < b.frontmatter.updated_at
        ? 1
        : a.frontmatter.updated_at > b.frontmatter.updated_at
          ? -1
          : a.frontmatter.id < b.frontmatter.id
            ? -1
            : 1,
    );
  const heading = "## Current state";
  if (candidates.length === 0) {
    return `${heading}\nNo state entry recorded. Use \`priors stage --kind state\` to add one.`;
  }
  const claim = candidates[0]!.frontmatter.claim;
  const body = `${heading}\n${claim}`;
  return truncateToBudget(body, budget);
}

function renderActiveDecisions(
  entries: LoadedEntry[],
  budget: number,
): string {
  const heading = "## Active decisions";
  const candidates = entries
    .filter(
      (e) =>
        e.frontmatter.kind === "decision" &&
        (e.frontmatter.status === "active" ||
          e.frontmatter.status === "contested"),
    )
    .sort((a, b) => {
      const conf = confRank(b.frontmatter.confidence) - confRank(a.frontmatter.confidence);
      if (conf !== 0) return conf;
      if (a.frontmatter.updated_at !== b.frontmatter.updated_at) {
        return a.frontmatter.updated_at < b.frontmatter.updated_at ? 1 : -1;
      }
      return a.frontmatter.id < b.frontmatter.id ? -1 : 1;
    });
  if (candidates.length === 0) {
    return `${heading}\n(none yet — \`priors stage --kind decision\` to add)`;
  }
  const top = candidates.slice(0, 7);
  let lines = top.map((e) => decisionLine(e));
  let body = [heading, ...lines].join("\n");
  while (approxTokens(body) > budget && lines.length > 1) {
    let removeIdx = lines.length - 1;
    let lowestRank = Infinity;
    for (let i = 0; i < top.length; i++) {
      const r = confRank(top[i]!.frontmatter.confidence);
      if (r < lowestRank) {
        lowestRank = r;
        removeIdx = i;
      }
    }
    top.splice(removeIdx, 1);
    lines = top.map((e) => decisionLine(e));
    body = [heading, ...lines].join("\n");
  }
  return body;
}

function decisionLine(e: LoadedEntry): string {
  const c = e.frontmatter.confidence[0]!.toLowerCase();
  const contested =
    e.frontmatter.relations.contradicts.length > 0
      ? ` (contested with ${e.frontmatter.relations.contradicts
          .map((id) => `\`${id}\``)
          .join(", ")})`
      : "";
  return `- \`${e.frontmatter.id}\` ${e.frontmatter.claim} (as_of ${e.frontmatter.as_of}, confidence: ${c})${contested}`;
}

function renderActiveConstraints(
  entries: LoadedEntry[],
  budget: number,
): string {
  const heading = "## Active constraints";
  const candidates = entries
    .filter(
      (e) =>
        e.frontmatter.kind === "constraint" &&
        e.frontmatter.status === "active",
    )
    .sort((a, b) => {
      if (a.frontmatter.updated_at !== b.frontmatter.updated_at) {
        return a.frontmatter.updated_at < b.frontmatter.updated_at ? 1 : -1;
      }
      return a.frontmatter.id < b.frontmatter.id ? -1 : 1;
    });
  if (candidates.length === 0) return `${heading}\n(none yet)`;

  const lines = candidates.map(
    (e) => `- \`${e.frontmatter.id}\` ${e.frontmatter.claim}`,
  );
  let kept = [...lines];
  let trailer = "";
  while (
    approxTokens([heading, ...kept, trailer].filter(Boolean).join("\n")) >
      budget &&
    kept.length > 0
  ) {
    kept.pop();
    const dropped = lines.length - kept.length;
    trailer = `…and ${dropped} more`;
  }
  return [heading, ...kept, ...(trailer ? [trailer] : [])].join("\n");
}

function renderOpenQuestions(
  entries: LoadedEntry[],
  budget: number,
): string {
  const heading = "## Open questions";
  const candidates = entries
    .filter(
      (e) =>
        e.frontmatter.kind === "question" &&
        (e.frontmatter.status === "active" ||
          e.frontmatter.status === "action_pending"),
    )
    .sort((a, b) => {
      if (a.frontmatter.created_at !== b.frontmatter.created_at) {
        return a.frontmatter.created_at < b.frontmatter.created_at ? 1 : -1;
      }
      return a.frontmatter.id < b.frontmatter.id ? -1 : 1;
    })
    .slice(0, 5);
  if (candidates.length === 0) return `${heading}\n(none yet)`;
  let lines = candidates.map(
    (e) =>
      `- \`${e.frontmatter.id}\` ${e.frontmatter.claim} (raised ${e.frontmatter.as_of})`,
  );
  let body = [heading, ...lines].join("\n");
  while (approxTokens(body) > budget && lines.length > 1) {
    lines = lines.slice(0, -1);
    body = [heading, ...lines].join("\n");
  }
  return body;
}

function renderContested(entries: LoadedEntry[], budget: number): string {
  const heading = "## Contested or under review";
  const candidates = entries
    .filter((e) => e.frontmatter.status === "contested")
    .sort((a, b) => {
      if (a.frontmatter.updated_at !== b.frontmatter.updated_at) {
        return a.frontmatter.updated_at < b.frontmatter.updated_at ? 1 : -1;
      }
      return a.frontmatter.id < b.frontmatter.id ? -1 : 1;
    });
  if (candidates.length === 0) return `${heading}\n(none)`;
  const top = candidates.slice(0, 5);
  let lines = top.map((e) => {
    const challenger = e.frontmatter.relations.contradicts[0];
    if (challenger) {
      return `- \`${e.frontmatter.id}\` ${e.frontmatter.claim}; challenged by \`${challenger}\` ${e.frontmatter.updated_at.slice(0, 10)}`;
    }
    return `- \`${e.frontmatter.id}\` ${e.frontmatter.claim}`;
  });
  if (candidates.length > 5) {
    lines = [...lines, `…and ${candidates.length - 5} more`];
  }
  let body = [heading, ...lines].join("\n");
  while (approxTokens(body) > budget && lines.length > 1) {
    lines = lines.slice(0, -1);
    body = [heading, ...lines].join("\n");
  }
  return body;
}

interface SupersedingEvent {
  oldId: string;
  oldClaim: string | null;
  newId: string;
  newClaim: string;
  date: string;
}

function collectSupersededSnapshots(
  entries: LoadedEntry[],
): SupersedingEvent[] {
  const byId = new Map(entries.map((e) => [e.frontmatter.id, e]));
  const events: SupersedingEvent[] = [];
  for (const e of entries) {
    for (const oldId of e.frontmatter.relations.supersedes) {
      const old = byId.get(oldId);
      events.push({
        oldId,
        oldClaim: old?.frontmatter.claim ?? null,
        newId: e.frontmatter.id,
        newClaim: e.frontmatter.claim,
        date: e.frontmatter.updated_at.slice(0, 10),
      });
    }
  }
  events.sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : a.newId < b.newId ? -1 : 1,
  );
  return events;
}

function renderRecentlySuperseded(
  _entries: LoadedEntry[],
  events: SupersedingEvent[],
  now: Date,
  budget: number,
): string {
  const heading = "## Recently superseded (last 14 days)";
  const window = (days: number) => {
    const cutoff = now.getTime() - days * MS_PER_DAY;
    return events.filter((ev) => Date.parse(`${ev.date}T00:00:00Z`) >= cutoff);
  };
  let inWindow = window(14);
  if (inWindow.length === 0) return `${heading}\n(none)`;
  let lines = inWindow.map(
    (ev) =>
      `- \`${ev.oldId}\` ${ev.oldClaim ?? "(missing entry)"} → \`${ev.newId}\` ${ev.newClaim} (${ev.date})`,
  );
  let body = [heading, ...lines].join("\n");
  if (approxTokens(body) > budget) {
    inWindow = window(7);
    lines = inWindow.map(
      (ev) =>
        `- \`${ev.oldId}\` ${ev.oldClaim ?? "(missing entry)"} → \`${ev.newId}\` ${ev.newClaim} (${ev.date})`,
    );
    lines.push("(window narrowed to last 7 days)");
    body = [heading, ...lines].join("\n");
  }
  while (approxTokens(body) > budget && lines.length > 1) {
    lines = lines.slice(0, -1);
    body = [heading, ...lines].join("\n");
  }
  return body;
}

function renderDeadEnds(
  entries: LoadedEntry[],
  now: Date,
  budget: number,
): string {
  const heading = "## Known dead ends (most relevant 5)";
  const failures = entries.filter(
    (e) =>
      e.frontmatter.kind === "failure" && e.frontmatter.status === "active",
  );
  if (failures.length === 0) return `${heading}\n(none yet)`;
  const inboundLinks = countInboundLinks(entries);
  const ranked = failures
    .map((e) => {
      const updatedMs = Date.parse(e.frontmatter.updated_at);
      const days = Math.max(0, (now.getTime() - updatedMs) / MS_PER_DAY);
      const recency = Math.exp(-days / 30);
      const links = inboundLinks.get(e.frontmatter.id) ?? 0;
      const score = 0.6 * recency + 0.4 * links;
      return { entry: e, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.entry.frontmatter.updated_at !== b.entry.frontmatter.updated_at) {
        return a.entry.frontmatter.updated_at < b.entry.frontmatter.updated_at
          ? 1
          : -1;
      }
      return a.entry.frontmatter.id < b.entry.frontmatter.id ? -1 : 1;
    })
    .slice(0, 5);
  let lines = ranked.map(({ entry }) => deadEndLine(entry));
  let body = [heading, ...lines].join("\n");
  while (approxTokens(body) > budget && lines.length > 1) {
    lines = lines.slice(0, -1);
    body = [heading, ...lines].join("\n");
  }
  return body;
}

function deadEndLine(e: LoadedEntry): string {
  const reason = extractRejectedReason(e.body) ?? "see entry for details";
  return `- \`${e.frontmatter.id}\` ${e.frontmatter.claim}; rejected because ${reason}`;
}

function extractRejectedReason(body: string): string | null {
  const match = body.match(/rejected because([^.\n]{0,160})/i);
  if (match && match[1]) return match[1].trim().replace(/[`*]/g, "");
  return null;
}

function countInboundLinks(entries: LoadedEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const r = e.frontmatter.relations;
    for (const id of [
      ...r.supersedes,
      ...r.contradicts,
      ...r.reinforces,
      ...r.derived_from,
    ]) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

function renderNextMoves(entries: LoadedEntry[], budget: number): string {
  const heading = "## Suggested next moves";
  const candidates = entries
    .filter(
      (e) =>
        e.frontmatter.kind === "question" &&
        e.frontmatter.status === "action_pending",
    )
    .sort((a, b) => {
      if (a.frontmatter.created_at !== b.frontmatter.created_at) {
        return a.frontmatter.created_at < b.frontmatter.created_at ? 1 : -1;
      }
      return a.frontmatter.id < b.frontmatter.id ? -1 : 1;
    })
    .slice(0, 3);
  if (candidates.length === 0) {
    return `${heading}\n- Stage a state entry describing what this project is currently working on.`;
  }
  let lines = candidates.map(
    (e) =>
      `- Resolve \`${e.frontmatter.id}\` (${e.frontmatter.claim})`,
  );
  let body = [heading, ...lines].join("\n");
  while (approxTokens(body) > budget && lines.length > 1) {
    lines = lines.slice(0, -1);
    body = [heading, ...lines].join("\n");
  }
  return body;
}

function renderFooter(stagedWarn: string | null): string {
  const lines = [
    "## How to fetch more",
    "- Full entry:    priors://entry/{id}",
    "- Evidence:      priors://audit/{id}",
    "- Chronology:    priors://log",
    "- Search:        recall(query, filters)",
  ];
  if (stagedWarn) {
    lines.push("");
    lines.push(stagedWarn);
  }
  return truncateToBudget(lines.join("\n"), SECTION_BUDGETS.footer);
}

function stagedBacklogWarning(
  staged: LoadedEntry[],
  now: Date,
): string | null {
  const aged = staged.filter((e) => {
    const ms = Date.parse(e.frontmatter.created_at);
    if (Number.isNaN(ms)) return false;
    return now.getTime() - ms > 30 * MS_PER_DAY;
  });
  if (aged.length > 50) {
    return `> Heads up: ${aged.length} staged entries are older than 30 days. Run \`priors review-staged\` to triage.`;
  }
  if (aged.length > 20) {
    return `> Heads up: ${aged.length} staged entries are older than 30 days.`;
  }
  return null;
}

function truncateToBudget(text: string, budget: number): string {
  if (approxTokens(text) <= budget) return text;
  let s = text;
  while (approxTokens(s) > budget && s.length > 0) {
    s = s.slice(0, -8);
  }
  return `${s}…`;
}

function confRank(c: string): number {
  switch (c) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

export function tokenCeiling(): number {
  return TOTAL_CEILING;
}

export function sectionBudgets(): typeof SECTION_BUDGETS {
  return SECTION_BUDGETS;
}

// Re-export so CLI can output a generated brief alongside the file.
export { isoDatetime };
