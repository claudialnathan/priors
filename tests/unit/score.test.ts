import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { computeScores } from "../../src/distill/score.ts";
import { configPath } from "../../src/store/config.ts";
import { stageLearning } from "../../src/distill/stage.ts";
import { withTempStore } from "../helpers/temp-store.ts";

const SOURCE = [
  "Tests must run, pass, and cover empty, normal, and adversarial cases.",
  "Distillation only writes to staged/.",
  "User must approve before active.",
].join("\n");

const VALID_EVIDENCE = [
  {
    quote: "tests must run, pass, and cover empty, normal, and adversarial cases.",
    source_ref: "internal/HEYAGENTS.md",
    location: "definition-of-done",
  },
];

function validInput() {
  return {
    kind: "decision" as const,
    claim: "Tests must cover empty, normal, and adversarial cases.",
    reasoning: "Reduces regressions and aligns with the project's definition of done.",
    confidence: "medium" as const,
    evidence: VALID_EVIDENCE,
  };
}

test("computeScores is deterministic — same input yields same output", () => {
  const a = computeScores(validInput(), SOURCE, []);
  const b = computeScores(validInput(), SOURCE, []);
  assert.deepEqual(a, b);
});

test("computeScores: a clean candidate with strong grounding gets all-1.0 sub-scores and composite 1.0", () => {
  const result = computeScores(validInput(), SOURCE, []);
  assert.equal(result.sub_scores.schema_ok, 1);
  assert.equal(result.sub_scores.length_ok, 1);
  assert.equal(result.sub_scores.forbidden_kind, 1);
  assert.equal(result.sub_scores.evidence_count, 1);
  assert.equal(result.sub_scores.transcript_support, 1);
  assert.equal(result.sub_scores.duplicate_risk, 1);
  assert.equal(result.composite, 1);
});

test("computeScores: forbidden_kind drops to 0 on user-shaped claims, zeroing the composite", () => {
  const result = computeScores(
    { ...validInput(), claim: "User prefers concise responses." },
    SOURCE,
    [],
  );
  assert.equal(result.sub_scores.forbidden_kind, 0);
  assert.equal(result.composite, 0);
});

test("computeScores: a fake evidence quote drops transcript_support and the composite", () => {
  const result = computeScores(
    {
      ...validInput(),
      evidence: [
        { quote: "this exact phrase does not appear in source" },
      ],
    },
    SOURCE,
    [],
  );
  assert.equal(result.sub_scores.transcript_support, 0);
  assert.equal(result.composite, 0);
});

test("computeScores: an exact-duplicate active entry zeroes duplicate_risk", () => {
  const input = validInput();
  const result = computeScores(input, SOURCE, [
    { kind: input.kind, claim: input.claim },
  ]);
  assert.equal(result.sub_scores.duplicate_risk, 0);
  assert.equal(result.composite, 0);
});

test("computeScores: length_ok decays past the cap and reaches 0 at 1.5×cap", () => {
  // Claim at 1.5× CLAIM_MAX (280) → overflow equals the ramp width → score 0.
  const claimAtRampEnd = "x".repeat(420);
  const r1 = computeScores(
    { ...validInput(), claim: claimAtRampEnd },
    SOURCE,
    [],
  );
  assert.equal(r1.sub_scores.length_ok, 0);
  // Claim halfway up the ramp (280 + 70 = 350) → length_ok ≈ 0.5.
  const claimMidRamp = "x".repeat(350);
  const r2 = computeScores(
    { ...validInput(), claim: claimMidRamp },
    SOURCE,
    [],
  );
  assert.ok(
    r2.sub_scores.length_ok > 0.45 && r2.sub_scores.length_ok < 0.55,
    `length_ok at mid-ramp should be ~0.5, got ${r2.sub_scores.length_ok}`,
  );
});

test("commitThreshold default 0.0 preserves current behaviour (passes a clean candidate)", async () => {
  await withTempStore(async (root, clock) => {
    const result = await stageLearning(
      root,
      {
        source_kind: "transcript",
        source_ref: "thresh-default",
        source_content: SOURCE,
        project_id: "p1",
        candidates: [validInput()],
      },
      { clock },
    );
    assert.equal(result.staged.length, 1);
    assert.equal(result.rejected.length, 0);
  });
});

test("commitThreshold above the entry's composite rejects with reason 'below_threshold'", async () => {
  await withTempStore(async (root, clock) => {
    const { seedEntry } = await import("../helpers/temp-store.ts");
    // Seed an entry whose claim shares 5 of 8 tokens with the candidate's
    // claim — similarity ≈ 0.71, below the 0.8 dedup cutoff but enough to
    // drop duplicate_risk to ≈ 0.29.
    await seedEntry(root, clock, {
      id: "pri-existing-related",
      kind: "decision",
      claim: "Cover empty, normal, and adversarial inputs in tests.",
    });
    const target = configPath(root);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify({ commitThreshold: 0.5 }));

    const result = await stageLearning(
      root,
      {
        source_kind: "transcript",
        source_ref: "thresh-tight",
        source_content: SOURCE,
        project_id: "p1",
        candidates: [validInput()],
      },
      { clock },
    );
    assert.equal(result.staged.length, 0);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0]!.reason_code, "below_threshold");
  });
});

test("propose curation event records sub_scores and composite", async () => {
  await withTempStore(async (root, clock) => {
    await stageLearning(
      root,
      {
        source_kind: "transcript",
        source_ref: "score-log",
        source_content: SOURCE,
        project_id: "p1",
        candidates: [validInput()],
      },
      { clock },
    );
    const { curationLog } = await import("../../src/store/paths.ts");
    const text = await fs.readFile(curationLog(root), "utf8");
    const events = text
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    const propose = events.find((e) => e["kind"] === "propose");
    assert.ok(propose, "propose event present");
    assert.ok(propose!["sub_scores"], "propose carries sub_scores");
    assert.equal(typeof propose!["composite"], "number");
    const subs = propose!["sub_scores"] as Record<string, number>;
    for (const k of [
      "schema_ok",
      "length_ok",
      "forbidden_kind",
      "evidence_count",
      "transcript_support",
      "duplicate_risk",
    ]) {
      assert.equal(typeof subs[k], "number", `${k} is a number`);
    }
  });
});
