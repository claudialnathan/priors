import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { stageLearning } from "../../src/distill/stage.ts";
import { configPath } from "../../src/store/config.ts";
import { withTempStore } from "../helpers/temp-store.ts";
import { FIXTURES } from "./fixtures.ts";

async function writeConfig(
  root: string,
  body: Record<string, unknown>,
): Promise<void> {
  const target = configPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(body));
}

test("strict mode rejects every adversarial fixture (default behaviour)", async () => {
  for (const fixture of FIXTURES) {
    await withTempStore(async (root, clock) => {
      const result = await stageLearning(
        root,
        {
          source_kind: "transcript",
          source_ref: `adv-${fixture.name}`,
          source_content: fixture.source,
          project_id: "p1",
          candidates: [fixture.candidate],
        },
        { clock },
      );
      assert.equal(
        result.staged.length,
        0,
        `${fixture.name}: should have staged nothing`,
      );
      assert.equal(
        result.rejected.length,
        1,
        `${fixture.name}: should have one rejection`,
      );
      assert.equal(
        result.rejected[0]!.reason_code,
        fixture.expectedReason,
        `${fixture.name}: wrong reason_code`,
      );
    });
  }
});

test("warn mode flips ungrounded_claim into a grounding_warning, but quote/forbidden still reject", async () => {
  for (const fixture of FIXTURES) {
    await withTempStore(async (root, clock) => {
      await writeConfig(root, { groundingMode: "warn" });
      const result = await stageLearning(
        root,
        {
          source_kind: "transcript",
          source_ref: `warn-${fixture.name}`,
          source_content: fixture.source,
          project_id: "p1",
          candidates: [fixture.candidate],
        },
        { clock },
      );
      if (fixture.expectedReason === "ungrounded_claim") {
        assert.equal(
          result.staged.length,
          1,
          `${fixture.name}: warn should still stage the entry`,
        );
        assert.ok(
          result.staged[0]!.flags.includes("grounding_warning"),
          `${fixture.name}: stage should carry grounding_warning flag`,
        );
        assert.equal(result.rejected.length, 0);
      } else {
        assert.equal(
          result.staged.length,
          0,
          `${fixture.name}: ${fixture.expectedReason} fails closed under warn`,
        );
        assert.equal(result.rejected.length, 1);
        assert.equal(
          result.rejected[0]!.reason_code,
          fixture.expectedReason,
        );
      }
    });
  }
});

test("ungrounded_claim rejections include unsupported_substrings in the curation log", async () => {
  const fixture = FIXTURES.find((f) => f.name === "claim_drift")!;
  await withTempStore(async (root, clock) => {
    await stageLearning(
      root,
      {
        source_kind: "transcript",
        source_ref: "adv-claim_drift",
        source_content: fixture.source,
        project_id: "p1",
        candidates: [fixture.candidate],
      },
      { clock },
    );
    const { curationLog } = await import("../../src/store/paths.ts");
    const text = await fs.readFile(curationLog(root), "utf8");
    const lines = text
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    const reject = lines.find((e) => e["kind"] === "reject");
    assert.ok(reject, "reject event should be present");
    assert.equal(reject!["reason_code"], "ungrounded_claim");
    assert.ok(
      Array.isArray(reject!["unsupported_substrings"]),
      "unsupported_substrings should be a list",
    );
    assert.ok(
      (reject!["unsupported_substrings"] as string[]).length > 0,
      "unsupported_substrings should not be empty",
    );
  });
});
