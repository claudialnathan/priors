import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  commitLearning,
  stageLearning,
  validateCommitInput,
  validateStageInput,
} from "../../src/distill/stage.ts";
import { findEntryById, readStagedEntry } from "../../src/store/entries.ts";
import { auditActionsLog, distillationRejectsLog } from "../../src/store/paths.ts";
import { withTempStore, seedEntry } from "../helpers/temp-store.ts";

function makeCandidate(overrides: Partial<{
  kind: string;
  claim: string;
  reasoning: string;
  confidence: string;
  evidence: Array<{ quote: string; source_ref: string; location: string }>;
  flags?: string[];
  id?: string;
}>): Record<string, unknown> {
  return {
    kind: "decision",
    claim: "Tests must cover empty, normal, and adversarial cases.",
    reasoning: "Reduces regressions and aligns with the project's definition of done.",
    confidence: "medium",
    evidence: [
      {
        quote: "tests must run, pass, and cover the empty, normal, and adversarial cases.",
        source_ref: "internal/HEYAGENTS.md",
        location: "definition-of-done",
      },
    ],
    ...overrides,
  };
}

const SOURCE_CONTENT = [
  "We agreed in the planning meeting:",
  "  - Tests must run, pass, and cover the empty, normal, and adversarial cases.",
  "  - Distillation only writes to staged/.",
  "  - User must approve before active.",
].join("\n");

test("validateStageInput rejects unknown fields and bad source_kind", () => {
  assert.throws(() => validateStageInput("nope"), /must be an object/);
  assert.throws(
    () =>
      validateStageInput({
        source_kind: "weird",
        source_ref: "x",
        source_content: "y",
        project_id: "p",
      }),
    /source_kind is required/,
  );
  assert.throws(
    () => validateStageInput({ source_kind: "transcript" }),
    /source_ref is required/,
  );
});

test("validateCommitInput requires a safe staged_id", () => {
  assert.throws(() => validateCommitInput({}), /staged_id is required/);
  assert.throws(
    () => validateCommitInput({ staged_id: "../etc/passwd" }),
    /staged_id is required/,
  );
  const ok = validateCommitInput({ staged_id: "pri-x" });
  assert.equal(ok.staged_id, "pri-x");
});

test("stage_learning without candidates returns the rendered prompt", async () => {
  await withTempStore(async (root, clock) => {
    const result = await stageLearning(
      root,
      {
        source_kind: "transcript",
        source_ref: "session-001",
        source_content: SOURCE_CONTENT,
        project_id: "p1",
      },
      { clock },
    );
    assert.equal(result.mode, "prompt");
    assert.ok(result.prompt);
    assert.match(result.prompt!.system, /conservative archivist/i);
    assert.match(result.prompt!.user, /source_kind: transcript/);
  });
});

test("stage_learning verifies a valid candidate and writes a staged entry", async () => {
  await withTempStore(async (root, clock) => {
    const result = await stageLearning(
      root,
      {
        source_kind: "transcript",
        source_ref: "session-001",
        source_content: SOURCE_CONTENT,
        project_id: "p1",
        candidates: [makeCandidate({})],
      },
      { clock },
    );
    assert.equal(result.mode, "verify");
    assert.equal(result.staged.length, 1);
    assert.equal(result.rejected.length, 0);
    const stagedRow = result.staged[0]!;
    const onDisk = await readStagedEntry(root, stagedRow.id);
    assert.ok(onDisk, "staged entry should exist on disk");
    assert.equal(onDisk!.frontmatter.status, "active");
    assert.equal(onDisk!.frontmatter.kind, "decision");
  });
});

test("stage_learning rejects candidates whose evidence quote is not in the source", async () => {
  await withTempStore(async (root, clock) => {
    const result = await stageLearning(
      root,
      {
        source_kind: "transcript",
        source_ref: "session-002",
        source_content: SOURCE_CONTENT,
        project_id: "p1",
        candidates: [
          makeCandidate({
            evidence: [
              {
                quote: "this exact phrase does not appear anywhere in the source",
                source_ref: "session-002",
                location: "line 1",
              },
            ],
          }),
        ],
      },
      { clock },
    );
    assert.equal(result.staged.length, 0);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0]?.reason_code, "quote_not_in_source");

    const rejectsLog = await fs.readFile(distillationRejectsLog(root), "utf8");
    assert.match(rejectsLog, /quote_not_in_source/);
  });
});

test("stage_learning rejects forbidden user-shaped claims", async () => {
  await withTempStore(async (root, clock) => {
    const result = await stageLearning(
      root,
      {
        source_kind: "transcript",
        source_ref: "session-003",
        source_content: SOURCE_CONTENT,
        project_id: "p1",
        candidates: [
          makeCandidate({
            claim: "User prefers concise responses.",
            reasoning: "User prefers concise responses, based on chat history.",
          }),
        ],
      },
      { clock },
    );
    assert.equal(result.staged.length, 0);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0]?.reason_code, "forbidden_kind");
  });
});

test("stage_learning enforces the cap of 5 candidates per pass", async () => {
  await withTempStore(async (root, clock) => {
    const candidates = new Array(6).fill(0).map((_, i) =>
      makeCandidate({ claim: `Candidate number ${i + 1} for testing.` }),
    );
    await assert.rejects(
      () =>
        stageLearning(
          root,
          {
            source_kind: "transcript",
            source_ref: "session-cap",
            source_content: SOURCE_CONTENT,
            project_id: "p1",
            candidates,
          },
          { clock },
        ),
      /too many candidates/,
    );
  });
});

test("stage_learning dedups against active entries with very similar claims", async () => {
  await withTempStore(async (root, clock) => {
    await seedEntry(root, clock, {
      id: "pri-existing-tests",
      kind: "decision",
      claim: "Tests must cover empty, normal, and adversarial cases.",
    });
    const result = await stageLearning(
      root,
      {
        source_kind: "transcript",
        source_ref: "session-dedup",
        source_content: SOURCE_CONTENT,
        project_id: "p1",
        candidates: [makeCandidate({})],
      },
      { clock },
    );
    assert.equal(result.staged.length, 0);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0]?.reason_code, "duplicate_of_active");
  });
});

test("commit_learning promotes a staged entry to active, then reports noop on retry", async () => {
  await withTempStore(async (root, clock) => {
    const stage = await stageLearning(
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
    assert.equal(stage.staged[0]?.id, "pri-test-tests");

    const first = await commitLearning(
      root,
      { staged_id: "pri-test-tests" },
      { clock },
    );
    assert.equal(first.noop, false);
    assert.equal(first.id, "pri-test-tests");
    const active = await findEntryById(root, "pri-test-tests");
    assert.ok(active, "entry should be in active set after commit");
    const stagedAfter = await readStagedEntry(root, "pri-test-tests");
    assert.equal(stagedAfter, null, "staged copy should be removed after commit");

    const second = await commitLearning(
      root,
      { staged_id: "pri-test-tests" },
      { clock },
    );
    assert.equal(second.noop, true);

    const auditText = await fs.readFile(auditActionsLog(root), "utf8");
    assert.match(auditText, /commit_learning/);
  });
});

test("commit_learning rejects an unknown staged_id", async () => {
  await withTempStore(async (root, clock) => {
    await assert.rejects(
      () => commitLearning(root, { staged_id: "pri-missing" }, { clock }),
      /staged entry pri-missing not found/,
    );
  });
});
