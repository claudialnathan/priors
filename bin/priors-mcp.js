#!/usr/bin/env node
import { main } from '../src/priors-mcp.ts';

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
