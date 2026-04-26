import { test } from "node:test";
import assert from "node:assert/strict";
import { appendAudit, appendRejection } from "../../../src/store/audit.ts";
import { readAuditForEntry } from "../../../src/store/audit-query.ts";
import { withTempStore } from "../../helpers/temp-store.ts";

test("readAuditForEntry returns events that mention the id, newest first", async () => {
  await withTempStore(async (root) => {
    await appendAudit(root, {
      ts: "2026-04-26T00:00:00Z",
      action: "stage_learning",
      actor: "tool",
      staged_id: "pri-audit-1",
    });
    await appendAudit(root, {
      ts: "2026-04-26T00:01:00Z",
      action: "commit_learning",
      actor: "user",
      entry_id: "pri-audit-1",
    });
    await appendAudit(root, {
      ts: "2026-04-26T00:02:00Z",
      action: "link_entries",
      actor: "tool",
      source_id: "pri-other",
      target_id: "pri-audit-1",
      relation: "reinforces",
    });
    await appendAudit(root, {
      ts: "2026-04-26T00:03:00Z",
      action: "noise",
      actor: "tool",
    });

    const events = await readAuditForEntry(root, "pri-audit-1");
    assert.equal(events.length, 3);
    assert.deepEqual(
      events.map((e) => e.action),
      ["link_entries", "commit_learning", "stage_learning"],
    );
    assert.equal(events[0]?.source, "actions");
  });
});

test("readAuditForEntry includes distillation rejection records", async () => {
  await withTempStore(async (root) => {
    await appendRejection(root, {
      ts: "2026-04-26T00:00:00Z",
      source_ref: "session://abc",
      reason_code: "quote_not_in_source",
      message: "fabricated",
      candidate: { id: "pri-reject-1" },
    });
    const events = await readAuditForEntry(root, "pri-reject-1");
    assert.equal(events.length, 1);
    assert.equal(events[0]?.source, "distillation_rejects");
    assert.equal(events[0]?.action, "distillation_rejected");
  });
});

test("readAuditForEntry returns [] when log files are missing or no matches", async () => {
  await withTempStore(async (root) => {
    const empty = await readAuditForEntry(root, "pri-nope");
    assert.deepEqual(empty, []);
    await appendAudit(root, {
      ts: "2026-04-26T00:00:00Z",
      action: "noise",
      actor: "tool",
    });
    const stillEmpty = await readAuditForEntry(root, "pri-nope");
    assert.deepEqual(stillEmpty, []);
  });
});

test("readAuditForEntry rejects unsafe entry ids", async () => {
  await withTempStore(async (root) => {
    await assert.rejects(
      () => readAuditForEntry(root, "../etc/passwd"),
      /invalid entry id/,
    );
  });
});

test("readAuditForEntry skips lines that fail to parse but does not throw", async () => {
  await withTempStore(async (root) => {
    await appendAudit(root, {
      ts: "2026-04-26T00:00:00Z",
      action: "stage_learning",
      actor: "tool",
      staged_id: "pri-mix",
    });
    const fs = await import("node:fs/promises");
    const { auditActionsLog } = await import("../../../src/store/paths.ts");
    await fs.appendFile(auditActionsLog(root), "not-json-line\n");
    const events = await readAuditForEntry(root, "pri-mix");
    assert.equal(events.length, 1);
  });
});
