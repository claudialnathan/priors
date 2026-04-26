import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleBrief } from "../../src/brief/assemble.ts";
import { withTempStore, seedEntry } from "../helpers/temp-store.ts";

const FIXED = "2026-04-26T00:00:00Z";

async function buildFixture(root: string, clock: import("../../src/util/clock.ts").Clock): Promise<void> {
  await seedEntry(root, clock, {
    id: "pri-snap-decision-1",
    kind: "decision",
    claim: "Use TypeScript on Node 25 with native type stripping.",
    confidence: "high",
    tags: ["stack"],
    body: "\n## Notes\n\nDeterministic, zero deps.\n",
  });
  await seedEntry(root, clock, {
    id: "pri-snap-decision-2",
    kind: "decision",
    claim: "Brief is assembled deterministically by code.",
    confidence: "high",
    body: "\n## Notes\n\nNo LLM-in-the-loop.\n",
  });
  await seedEntry(root, clock, {
    id: "pri-snap-constraint-1",
    kind: "constraint",
    claim: "Never edit .priors files directly; always go through MCP/CLI.",
    confidence: "high",
  });
  await seedEntry(root, clock, {
    id: "pri-snap-failure-1",
    kind: "failure",
    claim: "Active decay overcomplicated v0.3.",
    body: "\n## Notes\n\nApproach rejected because daemonized state was undeployable.\n",
  });
  await seedEntry(root, clock, {
    id: "pri-snap-question-1",
    kind: "question",
    claim: "Should we ship a hosted brief preview?",
  });
}

function normalizeProjectId(text: string): string {
  return text.replace(
    /\(id: [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\)/g,
    "(id: <uuid>)",
  );
}

test("assembleBrief produces byte-identical output for the same fixture", async () => {
  let firstText: string | null = null;
  for (let i = 0; i < 3; i++) {
    await withTempStore(
      async (root, clock) => {
        await buildFixture(root, clock);
        const brief = await assembleBrief(root, { clock });
        const normalized = normalizeProjectId(brief.text);
        if (firstText === null) {
          firstText = normalized;
        } else {
          assert.equal(
            normalized,
            firstText,
            `assembleBrief output drifted on iteration ${i}`,
          );
        }
        assert.ok(
          brief.totalTokens <= 2000,
          `brief exceeded ceiling: ${brief.totalTokens}`,
        );
      },
      { iso: FIXED },
    );
  }
  assert.ok(firstText, "brief text was empty");
});

test("brief always ends in a single trailing newline", async () => {
  await withTempStore(
    async (root, clock) => {
      await buildFixture(root, clock);
      const brief = await assembleBrief(root, { clock });
      assert.match(brief.text, /\n$/);
      assert.doesNotMatch(brief.text, /\n\n$/);
    },
    { iso: FIXED },
  );
});

test("brief includes the canonical headings in order", async () => {
  await withTempStore(
    async (root, clock) => {
      await buildFixture(root, clock);
      const brief = await assembleBrief(root, { clock });
      const order = [
        "# Project trajectory brief",
        "## Current state",
        "## Active decisions",
        "## Active constraints",
        "## Open questions",
        "## Contested or under review",
        "## Recently superseded",
        "## Known dead ends",
        "## Suggested next moves",
        "## How to fetch more",
      ];
      let cursor = -1;
      for (const heading of order) {
        const idx = brief.text.indexOf(heading, cursor + 1);
        assert.ok(idx > cursor, `heading out of order: ${heading}`);
        cursor = idx;
      }
    },
    { iso: FIXED },
  );
});
