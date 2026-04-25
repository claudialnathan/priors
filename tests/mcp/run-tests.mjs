#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const bin = path.join(repoRoot, 'bin', 'priors-mcp.js');
const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'priors-mcp-test-'));
const projectRoot = path.join(tmpRoot, 'project');
const priorsHome = path.join(tmpRoot, 'home', '.priors');

let pass = 0;
let fail = 0;

async function test(name, fn) {
  try {
    await fn();
    pass += 1;
    console.log(`  [PASS] ${name}`);
  } catch (error) {
    fail += 1;
    console.log(`  [FAIL] ${name}`);
    console.log(String(error?.stack || error).split('\n').map((line) => `    ${line}`).join('\n'));
  }
}

async function rpcSession(messages) {
  const child = spawn(process.execPath, [bin, '--project-root', projectRoot], {
    env: { ...process.env, PRIORS_HOME: priorsHome },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const responses = [];
  let stdout = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
    let newline = stdout.indexOf('\n');
    while (newline >= 0) {
      const line = stdout.slice(0, newline).trim();
      stdout = stdout.slice(newline + 1);
      newline = stdout.indexOf('\n');
      if (line) responses.push(JSON.parse(line));
    }
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  for (const message of messages) child.stdin.write(`${JSON.stringify(message)}\n`);
  child.stdin.end();
  const exitCode = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(exitCode, 0, stderr);
  return responses;
}

await mkdir(projectRoot, { recursive: true });
await writeFile(path.join(projectRoot, '.keep'), '');

console.log('');
console.log('=== mcp protocol ===');

await test('initialize, list tools/resources/prompts', async () => {
  const responses = await rpcSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'prompts/list', params: {} }
  ]);
  assert.equal(responses[0].result.serverInfo.name, 'priors');
  assert.ok(responses[1].result.tools.some((tool) => tool.name === 'priors.init'));
  assert.ok(responses[1].result.tools.some((tool) => tool.name === 'priors.reinforce'));
  assert.ok(responses[1].result.tools.every((tool) => tool.inputSchema && tool.outputSchema));
  assert.ok(responses[2].result.prompts.some((prompt) => prompt.name === 'priors_distill'));
  assert.ok(responses[2].result.prompts.some((prompt) => prompt.name === 'priors_reinforce'));
});

await test('init creates neutral store and resources are readable', async () => {
  const responses = await rpcSession([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'priors.init', arguments: { projectRoot, flow: 'fresh', answers: { project: 'Test project' } } } },
    { jsonrpc: '2.0', id: 2, method: 'resources/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'priors://orientation/head' } }
  ]);
  const init = JSON.parse(responses[0].result.content[0].text);
  assert.deepEqual(responses[0].result.structuredContent, init);
  assert.ok(init.storeDir.startsWith(priorsHome));
  assert.ok(responses[1].result.resources.some((resource) => resource.uri === 'priors://index'));
  assert.match(responses[2].result.contents[0].text, /Test project/);
});

await test('writeEntry commit validates, indexes, and recalls entries', async () => {
  const draft = {
    type: 'constraint',
    summary: 'Never write generated hooks directly to .git/hooks.',
    tags: ['security', 'mcp'],
    source: { session: null, commit: null, pr: null, files: ['AGENTS.md'] },
    confidence: 'high',
    rule: 'Never write generated hooks directly to .git/hooks.',
    enforcement: { type: 'agent-gate', matcher: '*', condition: 'target path is .git/hooks', message: 'Use .githooks/priors instead.' },
    applies_when: { paths: ['.git/hooks/**'], tags: ['security'] },
    derived_from: null,
    why: 'MCP emissions must not mutate Git hook internals directly.'
  };
  const responses = await rpcSession([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'priors.writeEntry', arguments: { draft, mode: 'commit' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'priors.recall', arguments: { query: '.git/hooks', includeEntries: true } } }
  ]);
  const commit = JSON.parse(responses[0].result.content[0].text);
  const recall = JSON.parse(responses[1].result.content[0].text);
  assert.equal(commit.committed, true);
  assert.equal(recall.count, 1);
  assert.match(recall.matches[0].body, /activation_score/);
});

await test('recall gates low uncertainty unless forced', async () => {
  const responses = await rpcSession([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'priors.recall', arguments: { query: '.git/hooks', uncertainty: 'low' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'priors.recall', arguments: { query: '.git/hooks', uncertainty: 'low', force: true } } }
  ]);
  const skipped = JSON.parse(responses[0].result.content[0].text);
  const forced = JSON.parse(responses[1].result.content[0].text);
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.count, 0);
  assert.equal(forced.skipped, false);
  assert.equal(forced.count, 1);
  assert.equal(forced.matches[0].retrieval_policy, 'decay-gated-typed-tag-path');
});

await test('reinforce rewards only successful helpful use', async () => {
  const recall = await rpcSession([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'priors.recall', arguments: { query: '.git/hooks' } } }
  ]);
  const entryId = JSON.parse(recall[0].result.content[0].text).matches[0].id;
  const rejected = await rpcSession([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'priors.reinforce', arguments: { entryIds: [entryId], outcome: 'helpful', responseSucceeded: false } } }
  ]);
  assert.ok(rejected[0].error);
  assert.match(rejected[0].error.message, /responseSucceeded/);

  const reinforced = await rpcSession([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'priors.reinforce', arguments: { entryIds: [entryId], outcome: 'helpful', responseSucceeded: true, reason: 'Entry shaped the emitted constraint path.' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'priors.recall', arguments: { query: '.git/hooks' } } }
  ]);
  const result = JSON.parse(reinforced[0].result.content[0].text);
  const recalled = JSON.parse(reinforced[1].result.content[0].text);
  assert.equal(result.updated[0].entryId, entryId);
  assert.equal(recalled.matches[0].helpful_count, 1);
  assert.ok(recalled.matches[0].decayed_activation_score > 1);
});

console.log('');
console.log('=== distill and verification ===');

await test('distill stages grounded proposals and verify supports evidence', async () => {
  const transcriptText = 'We decided to keep MCP stdio first.\nConstraint: never write generated hooks directly to .git/hooks.';
  const responses = await rpcSession([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'priors.distill', arguments: { transcriptText, maxProposals: 2 } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'priors.verifyProposals', arguments: { transcriptText } } }
  ]);
  const distill = JSON.parse(responses[0].result.content[0].text);
  const verify = JSON.parse(responses[1].result.content[0].text);
  assert.ok(distill.staged >= 1);
  assert.ok(verify.results.some((result) => result.evidenceSupported && result.actionable));
});

await test('commitProposals requires risk token for low score', async () => {
  const transcriptText = 'Pattern: use decay-gated typed tag path recall for v1.';
  const staged = await rpcSession([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'priors.distill', arguments: { transcriptText, maxProposals: 1 } } }
  ]);
  const proposalId = JSON.parse(staged[0].result.content[0].text).proposals[0].proposalId;
  const rejected = await rpcSession([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'priors.commitProposals', arguments: { proposalIds: [proposalId], threshold: 0.99 } } }
  ]);
  const result = JSON.parse(rejected[0].result.content[0].text);
  assert.equal(result.committed.length, 0);
  assert.equal(result.rejected.length, 1);
});

console.log('');
console.log('=== security and emissions ===');

await test('emit/apply writes only allowlisted paths with approval token', async () => {
  const recall = await rpcSession([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'priors.recall', arguments: { query: '.git/hooks' } } }
  ]);
  const entryId = JSON.parse(recall[0].result.content[0].text).matches[0].id;
  const emitted = await rpcSession([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'priors.emitConstraint', arguments: { entryId, artifact: 'pre-commit', mode: 'preview' } } }
  ]);
  const emission = JSON.parse(emitted[0].result.content[0].text);
  assert.equal(emission.security.allowlistedTarget, true);
  const applied = await rpcSession([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'priors.applyEmission', arguments: { emissionId: emission.id, approvalToken: 'APPLY_PRIORS_EMISSION' } } }
  ]);
  const result = JSON.parse(applied[0].result.content[0].text);
  assert.match(result.targetPath, /\.githooks\/priors/);
  assert.equal(existsSync(result.targetPath), true);
});

await test('resource read rejects path traversal entry ids', async () => {
  const responses = await rpcSession([
    { jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: 'priors://entry/../../evil' } }
  ]);
  assert.ok(responses[0].error);
  assert.match(responses[0].error.message, /Unsafe id/);
});

await test('init-config dry-run pins local node executable', async () => {
  const child = spawn(process.execPath, [bin, 'init-config', '--client', 'claude', '--project-root', projectRoot, '--dry-run'], {
    env: { ...process.env, PRIORS_HOME: priorsHome },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  const exitCode = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(exitCode, 0);
  const result = JSON.parse(stdout);
  assert.equal(result.config.mcpServers.priors.command, process.execPath);
  assert.ok(result.config.mcpServers.priors.args[0].endsWith('bin/priors-mcp.js'));
});

console.log('');
const total = pass + fail;
if (fail === 0) {
  console.log(`mcp-tests: ${pass}/${total} passed`);
} else {
  console.log(`mcp-tests: ${fail} of ${total} FAILED`);
}

await rm(tmpRoot, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
