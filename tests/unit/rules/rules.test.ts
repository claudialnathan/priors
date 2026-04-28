import test from "node:test";
import assert from "node:assert/strict";
import { withTempStore } from "../../helpers/temp-store.ts";
import { addUserRule, listRules } from "../../../src/rules/rules.ts";
import { userLog } from "../../../src/rules/user-log.ts";
import { regenerateIndex } from "../../../src/store/index.ts";

test("addUserRule: writes rule with readable id, author=user, priority=high", async () => {
  await withTempStore(async (root, clock) => {
    const r = await addUserRule(
      root,
      {
        claim: "Do not appease the user on outdated framework advice.",
        area: "agent-conduct",
      },
      { clock },
    );
    assert.equal(r.readable_id, "R-001");
    assert.match(r.id, /^rule-\d{8}-r-001$/);
    const rules = await listRules(root);
    assert.equal(rules.length, 1);
    assert.equal(rules[0]!.author, "user");
    assert.equal(rules[0]!.priority, "high");
    assert.equal(rules[0]!.area, "agent-conduct");
  });
});

test("addUserRule: allocates sequential readable ids", async () => {
  await withTempStore(async (root, clock) => {
    const a = await addUserRule(root, { claim: "first rule statement here" }, { clock });
    const b = await addUserRule(root, { claim: "second rule statement here" }, { clock });
    const c = await addUserRule(root, { claim: "third rule statement here" }, { clock });
    assert.equal(a.readable_id, "R-001");
    assert.equal(b.readable_id, "R-002");
    assert.equal(c.readable_id, "R-003");
  });
});

test("addUserRule: rejects empty claim", async () => {
  await withTempStore(async (root, clock) => {
    await assert.rejects(() => addUserRule(root, { claim: "   " }, { clock }), /non-empty/);
  });
});

test("listRules: filters out non-active and non-rule entries", async () => {
  await withTempStore(async (root, clock) => {
    await addUserRule(root, { claim: "active rule one for testing" }, { clock });
    // Adding a decision via /log should not appear in listRules
    await userLog(
      root,
      { claim: "decision claim that is sufficiently long to pass gate", kind: "decision" },
      { clock },
    );
    await regenerateIndex(root, { clock });
    const rules = await listRules(root);
    assert.equal(rules.length, 1);
    // listRules only returns kind=rule entries; the userLog decision should not appear.
    assert.match(rules[0]!.claim, /active rule one/);
  });
});

test("userLog: refuses noise-only claim via significance gate", async () => {
  await withTempStore(async (root, clock) => {
    await assert.rejects(
      () => userLog(root, { claim: "ok", user_text: "ok" }, { clock }),
      /significance|short/,
    );
  });
});

test("userLog: writes a decision with a readable id", async () => {
  await withTempStore(async (root, clock) => {
    const r = await userLog(
      root,
      {
        claim: "Priors UX uses readable ids over canonical UUIDs in human-facing flows.",
        kind: "decision",
        rationale: "users got confused typing raw ids",
      },
      { clock },
    );
    assert.equal(r.readable_id, "D-001");
    assert.equal(r.kind, "decision");
  });
});
