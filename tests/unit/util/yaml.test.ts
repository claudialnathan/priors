import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseFrontmatter,
  parseYaml,
  serializeFrontmatter,
  serializeYaml,
} from "../../../src/util/yaml.ts";

test("parseFrontmatter splits delimiter block from body", () => {
  const text = `---\nid: foo\nstatus: active\n---\n\n## Body\n`;
  const { data, body } = parseFrontmatter(text);
  assert.deepEqual(data, { id: "foo", status: "active" });
  assert.equal(body, "\n## Body\n");
});

test("parseFrontmatter requires the --- delimiter", () => {
  assert.throws(
    () => parseFrontmatter("no frontmatter here"),
    /missing YAML frontmatter/,
  );
});

test("parseYaml handles scalars, lists, nested maps", () => {
  const text = [
    "id: pri-foo",
    "active: true",
    "count: 3",
    "blank: null",
    "tags:",
    "  - alpha",
    "  - beta",
    "relations:",
    "  supersedes: []",
    "  contradicts:",
    "    - pri-bar",
  ].join("\n");
  const data = parseYaml(text) as Record<string, unknown>;
  assert.equal(data["id"], "pri-foo");
  assert.equal(data["active"], true);
  assert.equal(data["count"], 3);
  assert.equal(data["blank"], null);
  assert.deepEqual(data["tags"], ["alpha", "beta"]);
  assert.deepEqual(data["relations"], {
    supersedes: [],
    contradicts: ["pri-bar"],
  });
});

test("parseYaml handles list of maps (evidence-style)", () => {
  const text = [
    "evidence:",
    "  - quote: We chose Postgres",
    "    location: para 1",
    "  - quote: Redis caches sessions",
    "    location: para 2",
  ].join("\n");
  const data = parseYaml(text) as { evidence: Array<Record<string, string>> };
  assert.equal(data.evidence.length, 2);
  assert.equal(data.evidence[0]?.quote, "We chose Postgres");
  assert.equal(data.evidence[1]?.location, "para 2");
});

test("parseYaml rejects tabs in indentation", () => {
  const bad = "id: foo\n\ttags: []";
  assert.throws(() => parseYaml(bad), /tabs are not allowed/);
});

test("parseYaml rejects unexpected indent inside a map", () => {
  const bad = "id: foo\n     status: active";
  assert.throws(() => parseYaml(bad), /unexpected indent/);
});

test("parseYaml ignores blank lines and # comments", () => {
  const text = `# header\n\nid: foo\n# comment\nname: bar\n`;
  const data = parseYaml(text) as Record<string, string>;
  assert.equal(data["id"], "foo");
  assert.equal(data["name"], "bar");
});

test("parseYaml unquotes JSON-style double and single quoted strings", () => {
  const text = [
    `q1: "hello world"`,
    `q2: 'it''s fine'`,
    `bare: keep-me`,
  ].join("\n");
  const data = parseYaml(text) as Record<string, string>;
  assert.equal(data["q1"], "hello world");
  assert.equal(data["q2"], "it's fine");
  assert.equal(data["bare"], "keep-me");
});

test("serializeYaml round-trips scalars, lists, and maps", () => {
  const data = {
    id: "pri-1",
    active: true,
    count: 0,
    none: null,
    tags: ["alpha", "beta"],
    relations: {
      supersedes: [] as unknown[],
      contradicts: ["pri-2"],
    },
    evidence: [
      { quote: "Hello: world", location: "para 1" },
    ],
  } as const;
  const yaml = serializeYaml(data as unknown as Parameters<typeof serializeYaml>[0]);
  const parsed = parseYaml(yaml) as Record<string, unknown>;
  assert.deepEqual(parsed, data);
});

test("serializeFrontmatter wraps body with delimiters and trims leading newline", () => {
  const text = serializeFrontmatter(
    { id: "pri-1", status: "active" },
    "\n## Body\n",
  );
  assert.equal(text, "---\nid: pri-1\nstatus: active\n---\n## Body\n");
});

test("serializeYaml quotes strings that look like literals", () => {
  const yaml = serializeYaml({ value: "true" } as Record<string, unknown> as never);
  assert.match(yaml, /value: "true"/);
  const yaml2 = serializeYaml({ value: "123" } as Record<string, unknown> as never);
  assert.match(yaml2, /value: "123"/);
});

test("serializeYaml emits empty list and map markers", () => {
  const yaml = serializeYaml({ a: [], b: {} } as Record<string, unknown> as never);
  assert.equal(yaml, "a: []\nb: {}");
});
