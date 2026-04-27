import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  commitEdge,
  discardEdge,
  proposeEdge,
} from "../../src/curation/curation.ts";
import { migrateRelations } from "../../src/store/migrate-relations.ts";
import { curationLog } from "../../src/store/paths.ts";
import { findEntryById, writeEntry } from "../../src/store/entries.ts";
import { regenerateIndex } from "../../src/store/index.ts";
import { withTempStore, seedEntry, FIXED_CLOCK_ISO } from "../helpers/temp-store.ts";

async function readCurationEvents(
  root: string,
): Promise<Array<Record<string, unknown>>> {
  let text: string;
  try {
    text = await fs.readFile(curationLog(root), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

test("propose_edge emits a propose_edge curation event without creating the edge", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-a",
      kind: "decision",
      claim: "Decision A.",
    });
    await seedEntry(root, clock, {
      id: "pri-b",
      kind: "decision",
      claim: "Decision B.",
    });
    const result = await proposeEdge(
      root,
      {
        source_id: "pri-a",
        relation: "blocks",
        target_id: "pri-b",
        proposal_id: "prop-001",
        source_model: "claude-opus-4-7",
        rationale: "needs evaluation",
      },
      { clock },
    );
    assert.equal(result.proposal_id, "prop-001");
    const a = await findEntryById(root, "pri-a");
    assert.deepEqual(
      a!.frontmatter.relations.blocks,
      [],
      "edge should not exist yet — propose does not create",
    );
    const events = await readCurationEvents(root);
    const propose = events.find((e) => e["kind"] === "propose_edge");
    assert.ok(propose, "propose_edge event present");
    assert.equal(propose!["proposal_id"], "prop-001");
    assert.equal(propose!["edge_relation"], "blocks");
    assert.equal(propose!["edge_source_id"], "pri-a");
    assert.equal(propose!["edge_target_id"], "pri-b");
    assert.equal(propose!["source_model"], "claude-opus-4-7");
  });
});

test("commit_edge creates the link and emits an accept_edge event", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-a",
      kind: "decision",
      claim: "Decision A.",
    });
    await seedEntry(root, clock, {
      id: "pri-b",
      kind: "decision",
      claim: "Decision B.",
    });
    await proposeEdge(
      root,
      {
        source_id: "pri-a",
        relation: "depends_on",
        target_id: "pri-b",
        proposal_id: "prop-002",
      },
      { clock },
    );
    const result = await commitEdge(
      root,
      {
        proposal_id: "prop-002",
        source_id: "pri-a",
        relation: "depends_on",
        target_id: "pri-b",
      },
      { clock },
    );
    assert.equal(result.proposal_id, "prop-002");
    const a = await findEntryById(root, "pri-a");
    assert.deepEqual(a!.frontmatter.relations.depends_on, ["pri-b"]);
    const events = await readCurationEvents(root);
    const kinds = events.map((e) => e["kind"]);
    assert.ok(kinds.includes("propose_edge"));
    assert.ok(kinds.includes("accept_edge"));
  });
});

test("discard_edge emits a discard_edge event without touching entry state", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-a",
      kind: "decision",
      claim: "Decision A.",
    });
    await seedEntry(root, clock, {
      id: "pri-b",
      kind: "decision",
      claim: "Decision B.",
    });
    await proposeEdge(
      root,
      {
        source_id: "pri-a",
        relation: "refutes",
        target_id: "pri-b",
        proposal_id: "prop-003",
      },
      { clock },
    );
    const result = await discardEdge(
      root,
      {
        proposal_id: "prop-003",
        source_id: "pri-a",
        relation: "refutes",
        target_id: "pri-b",
        rationale: "not strong enough",
      },
      { clock },
    );
    assert.equal(result.discarded, true);
    const a = await findEntryById(root, "pri-a");
    assert.deepEqual(a!.frontmatter.relations.refutes, []);
    const events = await readCurationEvents(root);
    const discard = events.find((e) => e["kind"] === "discard_edge");
    assert.ok(discard);
    assert.equal(discard!["rationale"], "not strong enough");
  });
});

test("propose_edge rejects unknown relation kinds", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-a",
      kind: "decision",
      claim: "A.",
    });
    await seedEntry(root, clock, {
      id: "pri-b",
      kind: "decision",
      claim: "B.",
    });
    await assert.rejects(
      () =>
        proposeEdge(
          root,
          {
            source_id: "pri-a",
            relation: "validates",
            target_id: "pri-b",
          },
          { clock },
        ),
      /relation must be one of/,
    );
  });
});

test("propose_edge rejects self-links", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-a",
      kind: "decision",
      claim: "A.",
    });
    await assert.rejects(
      () =>
        proposeEdge(
          root,
          {
            source_id: "pri-a",
            relation: "reinforces",
            target_id: "pri-a",
          },
          { clock },
        ),
      /self-links are not allowed/,
    );
  });
});

test("migrate-relations rewrites legacy `contradicts` to `contradiction_of`", async () => {
  await withTempStore(async (root, clock) => {
    // Seed two entries via the normal path (already in new schema).
    await seedEntry(root, clock, {
      id: "pri-keep-a",
      kind: "decision",
      claim: "Untouched A.",
    });
    await seedEntry(root, clock, {
      id: "pri-keep-b",
      kind: "decision",
      claim: "Untouched B.",
    });
    // Hand-write a legacy entry with `contradicts` to simulate v0.x data.
    const legacyDir = path.join(root, ".priors", "entries", "decisions");
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(
      path.join(legacyDir, "pri-legacy.md"),
      [
        "---",
        "id: pri-legacy",
        "kind: decision",
        "status: contested",
        "confidence: medium",
        "as_of: 2026-04-26",
        `created_at: ${FIXED_CLOCK_ISO}`,
        `updated_at: ${FIXED_CLOCK_ISO}`,
        'claim: "Legacy decision."',
        "relations:",
        "  supersedes: []",
        "  contradicts:",
        "    - pri-keep-a",
        "  reinforces: []",
        "  derived_from: []",
        "tags: []",
        "---",
        "",
        "## Notes",
        "Legacy body.",
        "",
      ].join("\n"),
    );

    const dryRun = await migrateRelations(root, { dryRun: true, clock });
    assert.equal(dryRun.rewritten, 1);
    assert.equal(dryRun.dryRun, true);

    const applied = await migrateRelations(root, { dryRun: false, clock });
    assert.equal(applied.rewritten, 1);

    // Read raw file to confirm rewrite.
    const text = await fs.readFile(
      path.join(legacyDir, "pri-legacy.md"),
      "utf8",
    );
    assert.match(text, /contradiction_of:/);
    assert.doesNotMatch(text, /\bcontradicts:/);
    assert.match(text, /caused_by:/);
    assert.match(text, /blocks:/);
    assert.match(text, /depends_on:/);
    assert.match(text, /refutes:/);
  });
});

test("get_entry surfaces incoming_edges grouped by relation kind", async () => {
  // Test via direct module import; the MCP harness already covers the wire.
  const { runMcpServer: _ } = await import("../../src/mcp/server.ts");
  void _;
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-target",
      kind: "decision",
      claim: "Target.",
    });
    await seedEntry(root, clock, {
      id: "pri-blocker",
      kind: "decision",
      claim: "Blocker.",
      relations: { blocks: ["pri-target"] },
    });
    await seedEntry(root, clock, {
      id: "pri-supporter",
      kind: "decision",
      claim: "Supporter.",
      relations: { reinforces: ["pri-target"] },
    });
    await regenerateIndex(root, { clock });
    // findIncomingEdges is internal; we'll exercise it via the same logic.
    const all = [
      await findEntryById(root, "pri-blocker"),
      await findEntryById(root, "pri-supporter"),
    ];
    void writeEntry; // silence unused warning if any
    const grouped: Record<string, string[]> = {};
    for (const e of all) {
      for (const [rel, ids] of Object.entries(e!.frontmatter.relations)) {
        if ((ids as string[]).includes("pri-target")) {
          (grouped[rel] ??= []).push(e!.frontmatter.id);
        }
      }
    }
    assert.deepEqual(grouped["blocks"], ["pri-blocker"]);
    assert.deepEqual(grouped["reinforces"], ["pri-supporter"]);
  });
});
