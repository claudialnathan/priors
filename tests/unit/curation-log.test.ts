import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { commitLearning, stageLearning } from "../../src/distill/stage.ts";
import { discardStaged, editStaged } from "../../src/curation/curation.ts";
import { curationLog } from "../../src/store/paths.ts";
import { withTempStore } from "../helpers/temp-store.ts";

const SOURCE_CONTENT = [
  "We agreed in the planning meeting:",
  "  - Tests must run, pass, and cover the empty, normal, and adversarial cases.",
  "  - Distillation only writes to staged/.",
  "  - User must approve before active.",
].join("\n");

const VALID_EVIDENCE = [
  {
    quote: "tests must run, pass, and cover the empty, normal, and adversarial cases.",
    source_ref: "internal/HEYAGENTS.md",
    location: "definition-of-done",
  },
];

function makeCandidate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "decision",
    claim: "Tests must run, pass, and cover empty/normal/adversarial cases.",
    reasoning: "Reduces regressions and aligns with the project's definition of done.",
    confidence: "medium",
    evidence: VALID_EVIDENCE,
    ...overrides,
  };
}

async function readEvents(root: string): Promise<Array<Record<string, unknown>>> {
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

test("curation log: stage_learning emits propose then stage on a valid candidate", async () => {
  await withTempStore(async (root, clock) => {
    await stageLearning(
      root,
      {
        source_kind: "transcript",
        source_ref: "session-001",
        source_content: SOURCE_CONTENT,
        project_id: "p1",
        candidates: [makeCandidate()],
        source_model: "claude-opus-4-7",
      },
      { clock },
    );
    const events = await readEvents(root);
    const kinds = events.map((e) => e["kind"]);
    assert.deepEqual(kinds, ["propose", "stage"]);
    assert.equal(events[0]!["source_model"], "claude-opus-4-7");
    assert.equal(events[1]!["source_model"], "claude-opus-4-7");
    assert.equal(events[0]!["source_ref"], "session-001");
    assert.ok(events[0]!["original_payload"], "propose carries original payload");
    assert.ok(events[1]!["staged_id"], "stage carries staged id");
  });
});

test("curation log: defaults source_model to 'unknown' when omitted", async () => {
  await withTempStore(async (root, clock) => {
    await stageLearning(
      root,
      {
        source_kind: "transcript",
        source_ref: "session-002",
        source_content: SOURCE_CONTENT,
        project_id: "p1",
        candidates: [makeCandidate()],
      },
      { clock },
    );
    const events = await readEvents(root);
    for (const e of events) {
      assert.equal(e["source_model"], "unknown");
    }
  });
});

test("curation log: emits reject when verification fails (quote not in source)", async () => {
  await withTempStore(async (root, clock) => {
    await stageLearning(
      root,
      {
        source_kind: "transcript",
        source_ref: "session-003",
        source_content: SOURCE_CONTENT,
        project_id: "p1",
        candidates: [
          makeCandidate({
            evidence: [
              {
                quote: "this exact phrase does not appear anywhere in the source",
                source_ref: "session-003",
                location: "line 1",
              },
            ],
          }),
        ],
      },
      { clock },
    );
    const events = await readEvents(root);
    const kinds = events.map((e) => e["kind"]);
    assert.deepEqual(kinds, ["propose", "reject"]);
    assert.equal(events[1]!["reason_code"], "quote_not_in_source");
    assert.match(String(events[1]!["message"] ?? ""), /quote not found/);
    assert.ok(events[1]!["original_payload"], "reject carries original payload");
  });
});

test("curation log: commit_learning emits accept with edited_payload null when unmodified", async () => {
  await withTempStore(async (root, clock) => {
    await stageLearning(
      root,
      {
        source_kind: "transcript",
        source_ref: "session-commit",
        source_content: SOURCE_CONTENT,
        project_id: "p1",
        candidates: [makeCandidate({ id: "pri-test-tests" })],
      },
      { clock },
    );
    await commitLearning(
      root,
      { staged_id: "pri-test-tests", source_model: "claude-opus-4-7", rationale: "looks good" },
      { clock },
    );
    const events = await readEvents(root);
    const accept = events.find((e) => e["kind"] === "accept");
    assert.ok(accept, "accept event present");
    assert.equal(accept!["staged_id"], "pri-test-tests");
    assert.equal(accept!["entry_id"], "pri-test-tests");
    assert.equal(accept!["edited_payload"], null);
    assert.equal(accept!["rationale"], "looks good");
    assert.equal(accept!["source_model"], "claude-opus-4-7");
    assert.ok(accept!["original_payload"], "accept carries the pre-edit payload");
  });
});

test("curation log: edit_staged emits edit with both pre- and post-edit payloads", async () => {
  await withTempStore(async (root, clock) => {
    await stageLearning(
      root,
      {
        source_kind: "transcript",
        source_ref: "session-edit",
        source_content: SOURCE_CONTENT,
        project_id: "p1",
        candidates: [makeCandidate({ id: "pri-test-edit" })],
      },
      { clock },
    );
    await editStaged(
      root,
      {
        staged_id: "pri-test-edit",
        claim: "Tests must cover empty, normal, and adversarial inputs.",
        rationale: "tightening wording",
      },
      { clock },
    );
    const events = await readEvents(root);
    const edit = events.find((e) => e["kind"] === "edit");
    assert.ok(edit, "edit event present");
    const original = edit!["original_payload"] as Record<string, any>;
    const edited = edit!["edited_payload"] as Record<string, any>;
    assert.notEqual(original.frontmatter.claim, edited.frontmatter.claim);
    assert.equal(
      edited.frontmatter.claim,
      "Tests must cover empty, normal, and adversarial inputs.",
    );
    assert.equal(edit!["rationale"], "tightening wording");
  });
});

test("curation log: discard_staged emits discard with original payload", async () => {
  await withTempStore(async (root, clock) => {
    await stageLearning(
      root,
      {
        source_kind: "transcript",
        source_ref: "session-discard",
        source_content: SOURCE_CONTENT,
        project_id: "p1",
        candidates: [makeCandidate({ id: "pri-test-discard" })],
      },
      { clock },
    );
    await discardStaged(
      root,
      {
        staged_id: "pri-test-discard",
        rationale: "duplicate of an existing decision",
      },
      { clock },
    );
    const events = await readEvents(root);
    const discard = events.find((e) => e["kind"] === "discard");
    assert.ok(discard, "discard event present");
    assert.equal(discard!["staged_id"], "pri-test-discard");
    assert.equal(discard!["rationale"], "duplicate of an existing decision");
    assert.ok(discard!["original_payload"], "discard carries the original payload");
  });
});

test("curation log: full lifecycle (propose, stage, edit, accept) is reconstructable", async () => {
  await withTempStore(async (root, clock) => {
    await stageLearning(
      root,
      {
        source_kind: "transcript",
        source_ref: "session-life",
        source_content: SOURCE_CONTENT,
        project_id: "p1",
        candidates: [makeCandidate({ id: "pri-test-life" })],
        source_model: "claude-opus-4-7",
      },
      { clock },
    );
    await editStaged(
      root,
      {
        staged_id: "pri-test-life",
        claim: "Tests cover empty, normal, and adversarial cases.",
      },
      { clock },
    );
    await commitLearning(root, { staged_id: "pri-test-life" }, { clock });
    const events = await readEvents(root);
    const kinds = events.map((e) => e["kind"]);
    assert.deepEqual(kinds, ["propose", "stage", "edit", "accept"]);
    const ids = events
      .map((e) => e["staged_id"] ?? e["entry_id"])
      .filter((v): v is string => typeof v === "string");
    for (const id of ids) {
      assert.equal(id, "pri-test-life");
    }
  });
});
