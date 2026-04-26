import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  entryPathFor,
  kindToDir,
  priorsRoot,
  relativeFromPriors,
  stagedPathFor,
} from "../../../src/store/paths.ts";

test("kindToDir returns the canonical plural directory for each kind", () => {
  assert.equal(kindToDir("decision"), "decisions");
  assert.equal(kindToDir("failure"), "failures");
  assert.equal(kindToDir("constraint"), "constraints");
  assert.equal(kindToDir("pattern"), "patterns");
  assert.equal(kindToDir("question"), "questions");
  assert.equal(kindToDir("hypothesis"), "hypotheses");
});

test("priorsRoot resolves to <project>/.priors", () => {
  assert.equal(priorsRoot("/tmp/demo"), path.resolve("/tmp/demo/.priors"));
});

test("entryPathFor lands inside .priors/entries/<kind>/<id>.md", () => {
  const root = "/tmp/demo";
  const got = entryPathFor(root, "decision", "pri-foo");
  assert.equal(
    got,
    path.resolve("/tmp/demo/.priors/entries/decisions/pri-foo.md"),
  );
});

test("entryPathFor rejects unsafe ids", () => {
  assert.throws(() => entryPathFor("/tmp/demo", "decision", "../evil"));
  assert.throws(() => entryPathFor("/tmp/demo", "decision", "Bad/Slash"));
});

test("stagedPathFor lands inside .priors/staged/<id>.md", () => {
  const got = stagedPathFor("/tmp/demo", "pri-staged");
  assert.equal(got, path.resolve("/tmp/demo/.priors/staged/pri-staged.md"));
});

test("relativeFromPriors returns forward-slashed relative path", () => {
  const root = "/tmp/demo";
  const abs = path.resolve("/tmp/demo/.priors/entries/decisions/pri-x.md");
  assert.equal(
    relativeFromPriors(root, abs),
    "entries/decisions/pri-x.md",
  );
});

test("relativeFromPriors rejects paths outside .priors", () => {
  const root = "/tmp/demo";
  assert.throws(
    () => relativeFromPriors(root, "/etc/passwd"),
    /outside \.priors/,
  );
});
