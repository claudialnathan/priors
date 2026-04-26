#!/usr/bin/env node
// Priors v1 — single executable entry point. Dispatches to CLI or MCP server.
// Importing .ts directly relies on Node 25's native type stripping.
import { run } from "../src/cli/main.ts";

run(process.argv.slice(2)).catch((err) => {
  process.stderr.write(`priors: ${err?.message ?? err}\n`);
  process.exit(1);
});
