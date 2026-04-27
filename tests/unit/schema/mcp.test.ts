import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ENTRY_ID_PATTERN,
  PROMPT_DEFS,
  RESOURCE_URIS,
  TOOL_SCHEMAS,
} from "../../../src/schema/mcp.ts";

test("v1 exposes the approved tools and no more", () => {
  const expected = [
    "recall",
    "get_entry",
    "stage_learning",
    "commit_learning",
    "mark_stale",
    "link_entries",
    "discard_staged",
    "edit_staged",
    "propose_edge",
    "commit_edge",
    "discard_edge",
  ].sort();
  const actual = Object.keys(TOOL_SCHEMAS).sort();
  assert.deepEqual(actual, expected);
});

test("v1 does not expose deferred or removed tools", () => {
  const forbidden = [
    "emit_constraint",
    "reinforce",
    "discard",
    "writeEntry",
    "updateEntry",
    "distill",
    "verifyProposals",
    "commitProposals",
    "applyEmission",
    "export_pack",
    "import_pack",
  ];
  for (const name of forbidden) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(TOOL_SCHEMAS, name),
      false,
      `tool surface must not include ${name}`,
    );
  }
});

test("every tool input schema disallows additional properties", () => {
  for (const [name, def] of Object.entries(TOOL_SCHEMAS)) {
    const schema = (def as { inputSchema: { additionalProperties: boolean } }).inputSchema;
    assert.equal(
      schema.additionalProperties,
      false,
      `${name} must set additionalProperties: false`,
    );
  }
});

test("recall schema constrains relation direction and limit bounds", () => {
  const props = TOOL_SCHEMAS.recall.inputSchema.properties as Record<string, any>;
  assert.deepEqual(props["relation"].properties.direction.enum, ["from", "to"]);
  assert.equal(props["limit"].minimum, 1);
  assert.equal(props["limit"].maximum, 100);
});

test("entry id pattern matches AGENTS.md contract", () => {
  assert.equal(ENTRY_ID_PATTERN, "^[a-z0-9][a-z0-9-]{0,127}$");
});

test("RESOURCE_URIS matches the v1 surface", () => {
  assert.equal(RESOURCE_URIS.brief, "priors://brief");
  assert.equal(RESOURCE_URIS.index, "priors://index");
  assert.equal(RESOURCE_URIS.entryPrefix, "priors://entry/");
  assert.equal(RESOURCE_URIS.auditPrefix, "priors://audit/");
});

test("priors_distill prompt is exposed (the only v1 prompt)", () => {
  assert.deepEqual(Object.keys(PROMPT_DEFS), ["priors_distill"]);
  const args = PROMPT_DEFS.priors_distill.arguments.map((a) => a.name);
  assert.deepEqual(args, ["source_kind", "source_ref", "source_content", "project_id"]);
});

test("stage_learning rejects more than 5 candidates", () => {
  const props = TOOL_SCHEMAS.stage_learning.inputSchema.properties as Record<string, any>;
  assert.equal(props["candidates"].maxItems, 5);
});
