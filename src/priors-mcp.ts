import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const VERSION = '0.3.0';
const FORMAT_VERSION = '1.0.0';
const MCP_PROTOCOL_VERSION = '2025-11-25';
const APPLY_TOKEN = 'APPLY_PRIORS_EMISSION';
const RISK_TOKEN = 'I_ACCEPT_PRIORS_RISK';
const ENTRY_TYPES = ['correction', 'constraint', 'pattern', 'decision', 'dead-end', 'operator', 'open-question'];
const CONFIDENCE = ['low', 'medium', 'high'];
const STATUS = ['active', 'archived', 'superseded'];
const UNCERTAINTY = ['low', 'medium', 'high'];
const REINFORCEMENT_OUTCOMES = ['helpful', 'unhelpful', 'contradicted'];
const RETRIEVAL_POLICY = 'decay-gated-typed-tag-path';
const DEFAULT_ACTIVATION_SCORE = 1;
const LATENT_ACTIVATION_THRESHOLD = 0.15;
const REINFORCEMENT_STEP = 1.5;
const MAX_ACTIVATION_SCORE = 10;
const GENERIC_OUTPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: true
};

type AnyRecord = Record<string, any>;
type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method: string; params?: any };
type Context = {
  projectRoot: string;
  priorsHome: string;
  projectId: string;
  storeDir: string;
  legacyDir: string;
};

const toolDefinitions = [
  {
    name: 'priors.init',
    description: 'Initialize a vendor-neutral Priors store under ~/.priors for a project.',
    inputSchema: objectSchema({
      projectRoot: { type: 'string' },
      flow: { enum: ['existing', 'fresh', 'auto'] },
      answers: { type: 'object', additionalProperties: true }
    }, ['projectRoot']),
    outputSchema: GENERIC_OUTPUT_SCHEMA
  },
  {
    name: 'priors.recall',
    description: 'Recall typed Priors entries through a decay-gated read path by query, type, tag, or file path.',
    inputSchema: objectSchema({
      query: { type: 'string' },
      types: { type: 'array', items: { type: 'string' } },
      tags: { type: 'array', items: { type: 'string' } },
      paths: { type: 'array', items: { type: 'string' } },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
      includeEntries: { type: 'boolean' },
      includeLatent: { type: 'boolean' },
      minActivation: { type: 'number', minimum: 0 },
      uncertainty: { enum: ['low', 'medium', 'high'] },
      force: { type: 'boolean' }
    }),
    outputSchema: GENERIC_OUTPUT_SCHEMA
  },
  {
    name: 'priors.reinforce',
    description: 'Record whether recalled entries actively contributed to a successful response and update decay metadata.',
    inputSchema: objectSchema({
      entryIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
      outcome: { enum: ['helpful', 'unhelpful', 'contradicted'] },
      responseSucceeded: { type: 'boolean' },
      reason: { type: 'string' },
      evidenceRefs: { type: 'array', items: { type: 'object', additionalProperties: true } }
    }, ['entryIds', 'outcome']),
    outputSchema: GENERIC_OUTPUT_SCHEMA
  },
  {
    name: 'priors.writeEntry',
    description: 'Stage or commit one typed priors entry with validation and audit logging.',
    inputSchema: objectSchema({
      draft: { type: 'object', additionalProperties: true },
      mode: { enum: ['stage', 'commit'] },
      evidenceRefs: { type: 'array', items: { type: 'object', additionalProperties: true } }
    }, ['draft', 'mode']),
    outputSchema: GENERIC_OUTPUT_SCHEMA
  },
  {
    name: 'priors.updateEntry',
    description: 'Patch an existing priors entry through a validated write path.',
    inputSchema: objectSchema({
      id: { type: 'string' },
      patch: { type: 'object', additionalProperties: true },
      reason: { type: 'string' },
      evidenceRefs: { type: 'array', items: { type: 'object', additionalProperties: true } }
    }, ['id', 'patch', 'reason']),
    outputSchema: GENERIC_OUTPUT_SCHEMA
  },
  {
    name: 'priors.discard',
    description: 'Discard a staged proposal or archive a committed entry.',
    inputSchema: objectSchema({
      id: { type: 'string' },
      reason: { type: 'string' }
    }, ['id', 'reason']),
    outputSchema: GENERIC_OUTPUT_SCHEMA
  },
  {
    name: 'priors.distill',
    description: 'Conservatively stage typed proposals from transcript evidence.',
    inputSchema: objectSchema({
      transcriptText: { type: 'string' },
      transcriptPath: { type: 'string' },
      window: { type: 'string' },
      maxProposals: { type: 'integer', minimum: 1, maximum: 20 }
    }),
    outputSchema: GENERIC_OUTPUT_SCHEMA
  },
  {
    name: 'priors.verifyProposals',
    description: 'Verify staged or supplied proposals against transcript evidence and store state.',
    inputSchema: objectSchema({
      proposalIds: { type: 'array', items: { type: 'string' } },
      proposals: { type: 'array', items: { type: 'object', additionalProperties: true } },
      transcriptRef: { type: 'string' },
      transcriptText: { type: 'string' }
    }),
    outputSchema: GENERIC_OUTPUT_SCHEMA
  },
  {
    name: 'priors.commitProposals',
    description: 'Commit verified staged proposals above threshold; low-confidence commits require an approval token.',
    inputSchema: objectSchema({
      proposalIds: { type: 'array', items: { type: 'string' } },
      threshold: { type: 'number', minimum: 0, maximum: 1 },
      approvalToken: { type: 'string' }
    }, ['proposalIds']),
    outputSchema: GENERIC_OUTPUT_SCHEMA
  },
  {
    name: 'priors.emitConstraint',
    description: 'Generate a reviewable enforcement artifact from a constraint entry.',
    inputSchema: objectSchema({
      entryId: { type: 'string' },
      artifact: { enum: ['pre-commit', 'lint', 'test', 'opa', 'agent-gate'] },
      mode: { enum: ['preview'] }
    }, ['entryId', 'artifact', 'mode']),
    outputSchema: GENERIC_OUTPUT_SCHEMA
  },
  {
    name: 'priors.applyEmission',
    description: 'Apply a previously generated emission to an allowlisted repo path with approval.',
    inputSchema: objectSchema({
      emissionId: { type: 'string' },
      approvalToken: { type: 'string' }
    }, ['emissionId', 'approvalToken']),
    outputSchema: GENERIC_OUTPUT_SCHEMA
  },
  {
    name: 'priors.health',
    description: 'Audit the Priors store for stale, low-use, latent, contradicted, and duplicate entries.',
    inputSchema: objectSchema({
      axes: { type: 'array', items: { enum: ['stale', 'low-use', 'latent', 'contradicted', 'duplicates'] } }
    }),
    outputSchema: GENERIC_OUTPUT_SCHEMA
  },
  {
    name: 'priors.export',
    description: 'Export the current Priors store to an external directory.',
    inputSchema: objectSchema({
      targetPath: { type: 'string' },
      filter: { type: 'object', additionalProperties: true },
      dryRun: { type: 'boolean' }
    }, ['targetPath']),
    outputSchema: GENERIC_OUTPUT_SCHEMA
  }
];

const promptDefinitions = [
  {
    name: 'priors_init',
    description: 'Initialize project-scoped Priors memory.',
    arguments: [{ name: 'projectRoot', description: 'Absolute project root.', required: true }]
  },
  {
    name: 'priors_recall',
    description: 'Recall relevant Priors when uncertainty is material.',
    arguments: [{ name: 'query', description: 'Topic, path, tag, or entry id.', required: true }]
  },
  {
    name: 'priors_reinforce',
    description: 'Reinforce Priors entries that actively helped a successful response.',
    arguments: [{ name: 'entryIds', description: 'Comma-separated entry ids.', required: true }]
  },
  {
    name: 'priors_distill',
    description: 'Distill transcript evidence into staged proposals.',
    arguments: [{ name: 'transcript', description: 'Transcript text or path.', required: true }]
  },
  {
    name: 'priors_emit_constraint',
    description: 'Emit reviewable back-pressure artifact for a constraint.',
    arguments: [{ name: 'entryId', description: 'Constraint entry id.', required: true }]
  }
];

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  if (argv[0] === '--version' || argv[0] === 'version') {
    console.log(`priors-mcp ${VERSION}`);
    return;
  }
  if (argv[0] === 'init-config') {
    const result = await initConfig(argv.slice(1));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const parsed = parseFlags(argv);
  const context = resolveContext(parsed.projectRoot);
  await runStdioServer(context);
}

function objectSchema(properties: AnyRecord, required: string[] = []): AnyRecord {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    properties,
    required
  };
}

function parseFlags(argv: string[]): AnyRecord {
  const flags: AnyRecord = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

function resolveContext(projectRootInput?: string): Context {
  const projectRoot = path.resolve(projectRootInput || process.env.PRIORS_PROJECT_ROOT || process.cwd());
  const priorsHome = path.resolve(process.env.PRIORS_HOME || path.join(os.homedir(), '.priors'));
  const projectId = projectIdentifier(projectRoot);
  const storeDir = path.join(priorsHome, 'projects', projectId, 'priors');
  const legacyDir = path.join(os.homedir(), '.claude', 'projects', projectRoot.replace(/[\\/]/g, '-'), 'priors');
  return { projectRoot, priorsHome, projectId, storeDir, legacyDir };
}

function projectIdentifier(projectRoot: string): string {
  const base = slugify(path.basename(projectRoot) || 'project');
  const hash = createHash('sha256').update(projectRoot).digest('hex').slice(0, 12);
  return `${base}-${hash}`;
}

async function runStdioServer(context: Context): Promise<void> {
  process.stdin.setEncoding('utf8');
  let buffer = '';
  let chain = Promise.resolve();
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
      if (line.length === 0) continue;
      chain = chain.then(() => handleRpcLine(context, line));
    }
  });
  await new Promise<void>((resolve) => process.stdin.on('end', resolve));
  await chain;
}

async function handleRpcLine(context: Context, line: string): Promise<void> {
  let request: JsonRpcRequest;
  try {
    request = JSON.parse(line);
  } catch (error) {
    writeRpc({ jsonrpc: '2.0', id: null, error: rpcError(-32700, `Parse error: ${stringifyError(error)}`) });
    return;
  }

  if (request.id === undefined || request.id === null) {
    await handleNotification(context, request);
    return;
  }

  try {
    const result = await dispatchRpc(context, request);
    writeRpc({ jsonrpc: '2.0', id: request.id, result });
  } catch (error) {
    const message = stringifyError(error);
    writeRpc({ jsonrpc: '2.0', id: request.id, error: rpcError(-32000, message) });
  }
}

async function handleNotification(context: Context, request: JsonRpcRequest): Promise<void> {
  if (request.method === 'notifications/initialized') return;
  await appendAudit(context, 'notification.ignored', { method: request.method });
}

async function dispatchRpc(context: Context, request: JsonRpcRequest): Promise<any> {
  switch (request.method) {
    case 'initialize':
      return {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        },
        serverInfo: { name: 'priors', version: VERSION }
      };
    case 'tools/list':
      return { tools: toolDefinitions };
    case 'tools/call':
      return callTool(context, request.params?.name, request.params?.arguments || {});
    case 'resources/list':
      return listResources(context);
    case 'resources/read':
      return readResource(context, String(request.params?.uri || ''));
    case 'resources/templates/list':
      return {
        resourceTemplates: [
          {
            uriTemplate: 'priors://entry/{id}',
            name: 'Priors entry',
            description: 'Read a committed priors entry by id.',
            mimeType: 'text/yaml'
          },
          {
            uriTemplate: 'priors://audit/{id}',
            name: 'Priors audit event',
            description: 'Read an audit event by id.',
            mimeType: 'application/json'
          }
        ]
      };
    case 'prompts/list':
      return { prompts: promptDefinitions };
    case 'prompts/get':
      return getPrompt(String(request.params?.name || ''), request.params?.arguments || {});
    default:
      throw new Error(`Unsupported MCP method: ${request.method}`);
  }
}

async function callTool(context: Context, name: string, args: AnyRecord): Promise<any> {
  const toolContext = args.projectRoot ? resolveContext(args.projectRoot) : context;
  let result: any;
  switch (name) {
    case 'priors.init':
      result = await priorsInit(toolContext, args);
      break;
    case 'priors.recall':
      result = await priorsRecall(toolContext, args);
      break;
    case 'priors.reinforce':
      result = await priorsReinforce(toolContext, args);
      break;
    case 'priors.writeEntry':
      result = await priorsWriteEntry(toolContext, args);
      break;
    case 'priors.updateEntry':
      result = await priorsUpdateEntry(toolContext, args);
      break;
    case 'priors.discard':
      result = await priorsDiscard(toolContext, args);
      break;
    case 'priors.distill':
      result = await priorsDistill(toolContext, args);
      break;
    case 'priors.verifyProposals':
      result = await priorsVerifyProposals(toolContext, args);
      break;
    case 'priors.commitProposals':
      result = await priorsCommitProposals(toolContext, args);
      break;
    case 'priors.emitConstraint':
      result = await priorsEmitConstraint(toolContext, args);
      break;
    case 'priors.applyEmission':
      result = await priorsApplyEmission(toolContext, args);
      break;
    case 'priors.health':
      result = await priorsHealth(toolContext, args);
      break;
    case 'priors.export':
      result = await priorsExport(toolContext, args);
      break;
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return {
    structuredContent: result,
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
  };
}

async function priorsInit(context: Context, args: AnyRecord): Promise<AnyRecord> {
  assertProjectPath(context.projectRoot, context.projectRoot);
  await ensureStore(context);
  await migrateLegacyIfPresent(context);
  const now = isoNow();
  const today = dateOnly(now);
  const flow = args.flow === 'fresh' || args.flow === 'existing' ? args.flow : 'auto';
  const answers = args.answers && typeof args.answers === 'object' ? args.answers : {};
  const headPath = path.join(context.storeDir, 'HEAD.md');
  const operatorPath = path.join(context.storeDir, 'operator.yaml');
  const statePath = path.join(context.storeDir, 'state.json');
  const indexPath = path.join(context.storeDir, 'index.json');
  const contradictionsPath = path.join(context.storeDir, 'contradictions.json');

  if (!existsSync(headPath)) {
    const description = answers.project || answers.description || path.basename(context.projectRoot);
    await atomicWrite(headPath, [
      `# Priors - ${path.basename(context.projectRoot)}`,
      '',
      `_as of ${today}_`,
      '',
      '## Project',
      '',
      `- ${description}  [initialization]`,
      `- Project id: ${context.projectId}  [priors-mcp]`,
      '',
      '## Stack',
      '',
      '- Not inferred yet  [pending]',
      '',
      '## Stage',
      '',
      `- ${flow} initialization  [priors-mcp]`,
      '',
      '## Hard constraints',
      '',
      '- None recorded  [absence is data]',
      '',
      '## Open questions',
      '',
      '- None'
    ].join('\n'));
  }

  if (!existsSync(operatorPath)) {
    await atomicWrite(operatorPath, [
      `as_of: ${today}`,
      'known_back_pressure_targets: []',
      'notes: []'
    ].join('\n'));
  }

  if (!existsSync(statePath)) {
    await writeJson(statePath, {
      schema_version: 1,
      flow,
      initialized_at: now,
      active_branch: gitMaybe(context.projectRoot, ['rev-parse', '--abbrev-ref', 'HEAD']) || null,
      last_known_good_commit: gitMaybe(context.projectRoot, ['rev-parse', 'HEAD']) || null,
      project_root: context.projectRoot,
      priors_home: context.priorsHome,
      project_id: context.projectId,
      open_prs: [],
      known_broken: []
    });
  }

  if (!existsSync(indexPath)) await writeJson(indexPath, emptyIndex(now));
  if (!existsSync(contradictionsPath)) await writeJson(contradictionsPath, { updated: now, contradictions: [] });
  await atomicWrite(path.join(context.storeDir, '.format-version'), `${FORMAT_VERSION}\n`);
  await appendAudit(context, 'store.init', { flow, projectRoot: context.projectRoot });
  return {
    ok: true,
    storeDir: context.storeDir,
    projectId: context.projectId,
    migratedLegacy: existsSync(context.legacyDir)
  };
}

async function priorsRecall(context: Context, args: AnyRecord): Promise<AnyRecord> {
  await ensureStore(context);
  const query = String(args.query || '').toLowerCase();
  const types = new Set((args.types || []).map(String));
  const tags = new Set((args.tags || []).map(String));
  const pathQueries = (args.paths || []).map(String);
  const limit = clampNumber(args.limit || 10, 1, 50);
  const gate = recallGate(args, query, types, tags, pathQueries);
  if (!gate.shouldRead) {
    await appendAudit(context, 'entry.recall.skip', { query: args.query, gate });
    return {
      skipped: true,
      reason: gate.reason,
      retrievalPolicy: RETRIEVAL_POLICY,
      gate,
      matches: [],
      count: 0
    };
  }

  const index = await getIndex(context);
  const includeLatent = Boolean(args.includeLatent);
  const minActivation = typeof args.minActivation === 'number' ? args.minActivation : 0;
  const matches = index.entries
    .filter((entry: AnyRecord) => entry.status !== 'archived')
    .filter((entry: AnyRecord) => types.size === 0 || types.has(entry.type))
    .filter((entry: AnyRecord) => tags.size === 0 || (entry.tags || []).some((tag: string) => tags.has(tag)))
    .filter((entry: AnyRecord) => pathQueries.length === 0 || pathQueries.some((needle: string) => (entry.sourceFiles || []).some((file: string) => file.includes(needle))))
    .map((entry: AnyRecord) => {
      const activation = decayedActivation(entry);
      const enriched = {
        ...entry,
        decayed_activation_score: roundActivation(activation),
        activation_state: activationState(entry, activation)
      };
      const direct = directRecallMatch(enriched, query, tags, pathQueries);
      return { entry: enriched, score: recallScore(enriched, query, tags, pathQueries, activation), direct };
    })
    .filter((item: AnyRecord) => query.length === 0 || item.score > 0)
    .filter((item: AnyRecord) => includeLatent || item.entry.activation_state !== 'latent' || item.direct)
    .filter((item: AnyRecord) => item.entry.decayed_activation_score >= minActivation || item.direct)
    .sort((a: AnyRecord, b: AnyRecord) => b.score - a.score || String(a.entry.id).localeCompare(String(b.entry.id)))
    .slice(0, limit)
    .map((item: AnyRecord) => item.entry);

  const withBodies = [];
  if (args.includeEntries) {
    for (const entry of matches) {
      withBodies.push({ ...entry, body: await readEntryText(context, entry.id) });
    }
  }

  await appendAudit(context, 'entry.recall', { query: args.query, gate, matches: matches.map((entry: AnyRecord) => entry.id) });
  return {
    skipped: false,
    retrievalPolicy: RETRIEVAL_POLICY,
    gate,
    matches: args.includeEntries ? withBodies : matches,
    count: matches.length
  };
}

async function priorsReinforce(context: Context, args: AnyRecord): Promise<AnyRecord> {
  await ensureStore(context);
  const outcome = String(args.outcome || '');
  if (!REINFORCEMENT_OUTCOMES.includes(outcome)) throw new Error(`Invalid reinforcement outcome: ${outcome}`);
  const responseSucceeded = Boolean(args.responseSucceeded);
  if (outcome === 'helpful' && !responseSucceeded) {
    throw new Error('Helpful reinforcement requires responseSucceeded: true.');
  }

  const updated = [];
  const rejected = [];
  const now = isoNow();
  for (const entryId of args.entryIds || []) {
    assertSafeId(entryId);
    const current = await readEntry(context, entryId);
    if (!current) {
      rejected.push({ entryId, reason: 'not found' });
      continue;
    }

    const before = {
      activation_score: typeof current.activation_score === 'number' ? current.activation_score : 0,
      decayed_activation_score: roundActivation(decayedActivation(current)),
      helpful_count: integerOr(current.helpful_count, 0),
      contradicted_count: integerOr(current.contradicted_count, 0)
    };
    const next = { ...current, last_used_at: now };
    if (outcome === 'helpful') {
      next.helpful_count = integerOr(current.helpful_count, 0) + 1;
      next.activation_score = roundActivation(Math.min(MAX_ACTIVATION_SCORE, before.decayed_activation_score + REINFORCEMENT_STEP));
    } else if (outcome === 'unhelpful') {
      next.activation_score = roundActivation(Math.max(0, before.decayed_activation_score * 0.5));
    } else {
      next.contradicted_count = integerOr(current.contradicted_count, 0) + 1;
      next.activation_score = roundActivation(Math.max(0, before.decayed_activation_score * 0.25));
    }

    await writeEntry(context, next);
    updated.push({
      entryId,
      before,
      after: {
        activation_score: next.activation_score,
        helpful_count: integerOr(next.helpful_count, 0),
        contradicted_count: integerOr(next.contradicted_count, 0),
        last_used_at: next.last_used_at
      }
    });
  }

  await regenerateIndex(context);
  await appendAudit(context, 'entry.reinforce', {
    outcome,
    responseSucceeded,
    reason: args.reason || null,
    updated: updated.map((entry) => entry.entryId),
    rejected,
    evidenceRefs: args.evidenceRefs || []
  });
  return { outcome, responseSucceeded, updated, rejected };
}

async function priorsWriteEntry(context: Context, args: AnyRecord): Promise<AnyRecord> {
  await ensureStore(context);
  const mode = args.mode === 'stage' ? 'stage' : 'commit';
  const draft = normalizeEntry(context, args.draft || {});
  const validation = validateEntry(draft);
  if (!validation.ok) throw new Error(`Invalid entry: ${validation.errors.join('; ')}`);

  if (mode === 'stage') {
    const proposalId = `proposal-${draft.id}`;
    const proposal = {
      id: proposalId,
      draft,
      evidenceRefs: args.evidenceRefs || [],
      selfCritique: 'Staged directly through priors.writeEntry; requires verification before autonomous commit.',
      verification: null,
      created: isoNow()
    };
    await writeJson(path.join(context.storeDir, 'staging', `${proposalId}.json`), proposal);
    await appendAudit(context, 'entry.stage', { proposalId, entryId: draft.id });
    return { staged: true, proposalId, entryId: draft.id };
  }

  await writeEntry(context, draft);
  const index = await regenerateIndex(context);
  await appendAudit(context, 'entry.commit', { entryId: draft.id, evidenceRefs: args.evidenceRefs || [] });
  return { committed: true, entryId: draft.id, indexEntries: index.entries.length };
}

async function priorsUpdateEntry(context: Context, args: AnyRecord): Promise<AnyRecord> {
  await ensureStore(context);
  assertSafeId(args.id);
  const current = await readEntry(context, args.id);
  if (!current) throw new Error(`Entry not found: ${args.id}`);
  const updated = normalizeEntry(context, mergePatch(current, args.patch || {}));
  const validation = validateEntry(updated);
  if (!validation.ok) throw new Error(`Invalid patched entry: ${validation.errors.join('; ')}`);
  await writeEntry(context, updated);
  await regenerateIndex(context);
  await appendAudit(context, 'entry.update', { entryId: args.id, reason: args.reason, evidenceRefs: args.evidenceRefs || [] });
  return { updated: true, entryId: args.id };
}

async function priorsDiscard(context: Context, args: AnyRecord): Promise<AnyRecord> {
  await ensureStore(context);
  assertSafeId(args.id);
  const stagedPath = path.join(context.storeDir, 'staging', `${args.id}.json`);
  if (existsSync(stagedPath)) {
    await rm(stagedPath);
    await appendAudit(context, 'proposal.discard', { proposalId: args.id, reason: args.reason });
    return { discarded: true, kind: 'proposal', id: args.id };
  }

  const currentPath = entryPath(context, args.id);
  if (!existsSync(currentPath)) throw new Error(`No staged proposal or entry found: ${args.id}`);
  const target = path.join(context.storeDir, 'archive', `${args.id}.yaml`);
  await rename(currentPath, target);
  await regenerateIndex(context);
  await appendAudit(context, 'entry.archive', { entryId: args.id, reason: args.reason });
  return { discarded: true, kind: 'entry', id: args.id, archivedAt: target };
}

async function priorsDistill(context: Context, args: AnyRecord): Promise<AnyRecord> {
  await ensureStore(context);
  const transcript = await readTranscript(context, args);
  const lines = transcript.split(/\r?\n/);
  const maxProposals = clampNumber(args.maxProposals || 5, 1, 20);
  const proposals = [];

  for (let index = 0; index < lines.length && proposals.length < maxProposals; index += 1) {
    const line = lines[index].trim();
    if (line.length < 12) continue;
    const type = classifyTranscriptLine(line);
    if (!type) continue;
    if (!isActionableTrajectoryLine(line, type)) continue;
    const entry = normalizeEntry(context, {
      type,
      summary: summarizeLine(line),
      tags: inferTags(line),
      source: {
        session: null,
        commit: gitMaybe(context.projectRoot, ['rev-parse', '--short', 'HEAD']),
        pr: null,
        files: inferFiles(line)
      },
      confidence: 'medium',
      ...(type === 'constraint' ? constraintFieldsFromLine(line) : {}),
      ...(type === 'correction' ? { symptom: line, wrong_approach: null, correct_approach: null, why: line, detection: null } : {}),
      ...(type === 'decision' ? { question: null, chosen: line, alternatives: [], why: line, revisit_if: null } : {}),
      ...(type === 'dead-end' ? { attempted: line, reasoning: null, failure: line, conclusion: line, retry_conditions: [] } : {}),
      ...(type === 'pattern' ? { situation: null, approach: line, why_it_works: line, counter_examples: [] } : {}),
      ...(type === 'open-question' ? { question: line, why_deferred: null, watch_for: [] } : {}),
      trajectory: trajectoryFieldsFromLine(line, type)
    });
    const proposalId = `proposal-${entry.id}`;
    const proposal = {
      id: proposalId,
      draft: entry,
      evidenceRefs: [{ kind: 'transcript-line', line: index + 1, quote: line }],
      selfCritique: 'This proposal is grounded in one transcript line. It should be rejected if the line is rhetorical, quoted from another source, or contradicted elsewhere in the transcript.',
      verification: null,
      created: isoNow()
    };
    await writeJson(path.join(context.storeDir, 'staging', `${proposalId}.json`), proposal);
    proposals.push({ proposalId, entryId: entry.id, type, summary: entry.summary });
  }

  await appendAudit(context, 'distill.stage', { proposalIds: proposals.map((proposal) => proposal.proposalId) });
  return { staged: proposals.length, proposals };
}

async function priorsVerifyProposals(context: Context, args: AnyRecord): Promise<AnyRecord> {
  await ensureStore(context);
  const transcript = await readTranscript(context, args, true);
  const proposals = await loadProposals(context, args);
  const index = await getIndex(context);
  const results = [];

  for (const proposal of proposals) {
    const validation = validateEntry(proposal.draft);
    const evidenceQuotes = (proposal.evidenceRefs || []).map((ref: AnyRecord) => String(ref.quote || '')).filter(Boolean);
    const evidenceSupported = transcript ? evidenceQuotes.every((quote: string) => transcript.includes(quote)) : evidenceQuotes.length > 0;
    const duplicate = index.entries.some((entry: AnyRecord) => normalizeText(entry.summary) === normalizeText(proposal.draft.summary));
    const contradictionRisk = index.entries.some((entry: AnyRecord) => sharesTag(entry, proposal.draft) && negationMismatch(entry.summary, proposal.draft.summary));
    const actionable = isActionableEntry(proposal.draft);
    let score = validation.ok ? 0.55 : 0.1;
    if (evidenceSupported) score += 0.3;
    if (actionable) score += 0.1;
    else score -= 0.2;
    if (duplicate) score -= 0.25;
    if (contradictionRisk) score -= 0.15;
    score = Math.max(0, Math.min(1, Number(score.toFixed(2))));
    const result = {
      proposalId: proposal.id,
      entryId: proposal.draft.id,
      ok: validation.ok && evidenceSupported && !duplicate && actionable,
      score,
      validationErrors: validation.errors,
      evidenceSupported,
      actionable,
      duplicate,
      contradictionRisk
    };
    proposal.verification = result;
    if (proposal.id) await writeJson(path.join(context.storeDir, 'staging', `${proposal.id}.json`), proposal);
    results.push(result);
  }

  await appendAudit(context, 'proposal.verify', { results });
  return { results };
}

async function priorsCommitProposals(context: Context, args: AnyRecord): Promise<AnyRecord> {
  await ensureStore(context);
  const threshold = typeof args.threshold === 'number' ? args.threshold : 0.8;
  const committed = [];
  const rejected = [];

  for (const proposalId of args.proposalIds || []) {
    assertSafeId(proposalId);
    const proposalPath = path.join(context.storeDir, 'staging', `${proposalId}.json`);
    if (!existsSync(proposalPath)) {
      rejected.push({ proposalId, reason: 'not found' });
      continue;
    }
    const proposal = JSON.parse(await readFile(proposalPath, 'utf8'));
    const verification = proposal.verification || {};
    const score = typeof verification.score === 'number' ? verification.score : 0;
    if (score < threshold && args.approvalToken !== RISK_TOKEN) {
      rejected.push({ proposalId, reason: `score ${score} below threshold ${threshold}; approvalToken required` });
      continue;
    }
    const validation = validateEntry(proposal.draft);
    if (!validation.ok) {
      rejected.push({ proposalId, reason: validation.errors.join('; ') });
      continue;
    }
    await writeEntry(context, proposal.draft);
    await rm(proposalPath);
    committed.push({ proposalId, entryId: proposal.draft.id, score });
  }

  await regenerateIndex(context);
  await appendAudit(context, 'proposal.commit', { committed, rejected, threshold });
  return { committed, rejected };
}

async function priorsEmitConstraint(context: Context, args: AnyRecord): Promise<AnyRecord> {
  await ensureStore(context);
  if (args.mode !== 'preview') throw new Error('Only preview mode is supported for emission generation.');
  assertSafeId(args.entryId);
  const entry = await readEntry(context, args.entryId);
  if (!entry) throw new Error(`Entry not found: ${args.entryId}`);
  if (entry.type !== 'constraint') throw new Error(`Entry is not a constraint: ${args.entryId}`);
  const artifact = String(args.artifact || '');
  const emission = buildEmission(context, entry, artifact);
  await writeJson(path.join(context.storeDir, 'emitted', `${emission.id}.json`), emission);
  await appendAudit(context, 'constraint.emit', { emissionId: emission.id, entryId: entry.id, artifact });
  return emission;
}

async function priorsApplyEmission(context: Context, args: AnyRecord): Promise<AnyRecord> {
  await ensureStore(context);
  assertSafeId(args.emissionId);
  if (args.approvalToken !== APPLY_TOKEN) throw new Error(`approvalToken must be ${APPLY_TOKEN}`);
  const emissionPath = path.join(context.storeDir, 'emitted', `${args.emissionId}.json`);
  if (!existsSync(emissionPath)) throw new Error(`Emission not found: ${args.emissionId}`);
  const emission = JSON.parse(await readFile(emissionPath, 'utf8'));
  if (!isAllowedEmissionPath(emission.targetPath)) {
    await appendAudit(context, 'emission.reject', { emissionId: args.emissionId, targetPath: emission.targetPath, reason: 'target not allowlisted' });
    throw new Error(`Emission target is not allowlisted: ${emission.targetPath}`);
  }
  const absoluteTarget = path.resolve(context.projectRoot, emission.targetPath);
  assertProjectPath(context.projectRoot, absoluteTarget);
  await mkdir(path.dirname(absoluteTarget), { recursive: true });
  await atomicWrite(absoluteTarget, emission.content);
  await appendAudit(context, 'emission.apply', { emissionId: args.emissionId, targetPath: emission.targetPath });
  return { applied: true, emissionId: args.emissionId, targetPath: absoluteTarget };
}

async function priorsHealth(context: Context, args: AnyRecord): Promise<AnyRecord> {
  await ensureStore(context);
  const axes = new Set((args.axes || ['stale', 'low-use', 'latent', 'contradicted', 'duplicates']).map(String));
  const index = await getIndex(context);
  const today = new Date(dateOnly(isoNow()));
  const findings: AnyRecord = {};

  if (axes.has('stale')) {
    findings.stale = index.entries.filter((entry: AnyRecord) => entry.valid_through && new Date(entry.valid_through) < today);
  }
  if (axes.has('low-use')) {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    findings.lowUse = index.entries.filter((entry: AnyRecord) => {
      const created = Date.parse(entry.valid_from || entry.created || isoNow());
      return (entry.helpful_count || 0) === 0 && (entry.contradicted_count || 0) === 0 && created < thirtyDaysAgo;
    });
  }
  if (axes.has('latent')) {
    findings.latent = index.entries.filter((entry: AnyRecord) => entry.status === 'active' && activationState(entry, decayedActivation(entry)) === 'latent');
  }
  if (axes.has('contradicted')) {
    findings.contradicted = index.entries.filter((entry: AnyRecord) => (entry.contradicted_count || 0) > 0 && entry.status === 'active');
  }
  if (axes.has('duplicates')) {
    findings.duplicates = duplicateCandidates(index.entries);
  }

  await appendAudit(context, 'store.health', { axes: [...axes], counts: Object.fromEntries(Object.entries(findings).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0])) });
  return { findings };
}

async function priorsExport(context: Context, args: AnyRecord): Promise<AnyRecord> {
  await ensureStore(context);
  const targetPath = path.resolve(String(args.targetPath || ''));
  if (!targetPath) throw new Error('targetPath is required');
  const exportRoot = path.join(targetPath, 'priors');
  const files = await walkFiles(context.storeDir);
  if (args.dryRun) {
    return { dryRun: true, exportRoot, files: files.map((file) => path.relative(context.storeDir, file)) };
  }
  await mkdir(exportRoot, { recursive: true });
  for (const file of files) {
    const relative = path.relative(context.storeDir, file);
    const target = path.join(exportRoot, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await atomicWrite(target, await readFile(file, 'utf8'));
  }
  await writeJson(path.join(exportRoot, 'MANIFEST.json'), {
    exported_at: isoNow(),
    source: context.storeDir,
    project_id: context.projectId,
    format_version: FORMAT_VERSION,
    file_count: files.length
  });
  await appendAudit(context, 'store.export', { targetPath: exportRoot });
  return { exported: true, exportRoot, fileCount: files.length };
}

async function listResources(context: Context): Promise<AnyRecord> {
  await ensureStore(context);
  const resources = [
    resource('priors://orientation/head', 'Priors HEAD', 'Cold-start project orientation.', 'text/markdown'),
    resource('priors://operator', 'Priors operator', 'Project-scoped operator context.', 'text/yaml'),
    resource('priors://state', 'Priors state', 'Live project state pointers.', 'application/json'),
    resource('priors://index', 'Priors index', 'Machine index of active entries.', 'application/json'),
    resource('priors://compiled/harness-reminders', 'Priors harness reminders', 'Compiled cold-start reminders.', 'text/markdown')
  ];
  const index = await getIndex(context);
  for (const entry of index.entries) {
    resources.push(resource(`priors://entry/${entry.id}`, `Entry ${entry.id}`, entry.summary, 'text/yaml'));
  }
  return { resources };
}

async function readResource(context: Context, uri: string): Promise<AnyRecord> {
  await ensureStore(context);
  let filePath: string | null = null;
  let mimeType = 'text/plain';
  if (uri === 'priors://orientation/head') {
    filePath = path.join(context.storeDir, 'HEAD.md');
    mimeType = 'text/markdown';
  } else if (uri === 'priors://operator') {
    filePath = path.join(context.storeDir, 'operator.yaml');
    mimeType = 'text/yaml';
  } else if (uri === 'priors://state') {
    filePath = path.join(context.storeDir, 'state.json');
    mimeType = 'application/json';
  } else if (uri === 'priors://index') {
    filePath = path.join(context.storeDir, 'index.json');
    mimeType = 'application/json';
  } else if (uri === 'priors://compiled/harness-reminders') {
    filePath = path.join(context.storeDir, 'compiled', 'harness-reminders.md');
    mimeType = 'text/markdown';
  } else if (uri.startsWith('priors://entry/')) {
    const id = uri.slice('priors://entry/'.length);
    assertSafeId(id);
    filePath = entryPath(context, id);
    mimeType = 'text/yaml';
  } else if (uri.startsWith('priors://audit/')) {
    const id = uri.slice('priors://audit/'.length);
    assertSafeId(id);
    const event = await findAuditEvent(context, id);
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(event, null, 2) }] };
  }
  if (!filePath) throw new Error(`Unknown resource URI: ${uri}`);
  const text = existsSync(filePath) ? await readFile(filePath, 'utf8') : '';
  return { contents: [{ uri, mimeType, text }] };
}

function getPrompt(name: string, args: AnyRecord): AnyRecord {
  const prompts: Record<string, string> = {
    priors_init: `Initialize Priors for ${args.projectRoot || 'this project'} by calling priors.init, then read priors://orientation/head, priors://operator, and priors://state.`,
    priors_recall: `Call priors.recall with query ${JSON.stringify(args.query || '')} when uncertainty is medium or high. Pass tags or paths when available, and use returned dated entries as project-scoped evidence, not timeless belief.`,
    priors_reinforce: `Call priors.reinforce for entries ${args.entryIds || '<entry-ids>'} only if those entries actively contributed to a successful response.`,
    priors_distill: 'Call priors.distill with transcript evidence, then priors.verifyProposals before committing any proposal.',
    priors_emit_constraint: `Call priors.emitConstraint for ${args.entryId || '<entry-id>'} in preview mode. Apply only with an explicit approval token.`
  };
  if (!prompts[name]) throw new Error(`Unknown prompt: ${name}`);
  return {
    description: promptDefinitions.find((prompt) => prompt.name === name)?.description || name,
    messages: [{ role: 'user', content: { type: 'text', text: prompts[name] } }]
  };
}

async function initConfig(argv: string[]): Promise<AnyRecord> {
  const flags = parseFlags(argv);
  const client = String(flags.client || '');
  if (!['claude', 'cursor', 'windsurf'].includes(client)) throw new Error('--client must be claude, cursor, or windsurf');
  const projectRoot = path.resolve(flags.projectRoot || process.cwd());
  const binPath = path.resolve(process.argv[1] || 'bin/priors-mcp.js');
  const serverConfig = {
    priors: {
      type: client === 'windsurf' ? undefined : 'stdio',
      command: process.execPath,
      args: [binPath, '--project-root', projectRoot],
      env: { PRIORS_HOME: path.join(os.homedir(), '.priors') }
    }
  };
  if (client === 'windsurf') delete serverConfig.priors.type;
  let configPath: string;
  if (client === 'claude') configPath = path.join(projectRoot, '.mcp.json');
  else if (client === 'cursor') configPath = path.join(projectRoot, '.cursor', 'mcp.json');
  else configPath = path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json');

  const config = await mergeMcpConfig(configPath, serverConfig);
  if (!flags.dryRun) {
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeJson(configPath, config);
  }
  return { client, configPath, dryRun: Boolean(flags.dryRun), config };
}

async function mergeMcpConfig(configPath: string, serverConfig: AnyRecord): Promise<AnyRecord> {
  let existing: AnyRecord = {};
  if (existsSync(configPath)) {
    existing = JSON.parse(await readFile(configPath, 'utf8'));
  }
  return {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers || {}),
      ...serverConfig
    }
  };
}

async function ensureStore(context: Context): Promise<void> {
  for (const directory of ['', 'entries', 'staging', 'audit', 'emitted', 'compiled', 'archive']) {
    await mkdir(path.join(context.storeDir, directory), { recursive: true });
  }
}

async function migrateLegacyIfPresent(context: Context): Promise<void> {
  if (!existsSync(context.legacyDir)) return;
  const marker = path.join(context.storeDir, '.legacy-migrated');
  if (existsSync(marker)) return;
  const files = await walkFiles(context.legacyDir);
  for (const file of files) {
    const relative = path.relative(context.legacyDir, file);
    const target = path.join(context.storeDir, relative);
    if (existsSync(target)) continue;
    await mkdir(path.dirname(target), { recursive: true });
    await atomicWrite(target, await readFile(file, 'utf8'));
  }
  await atomicWrite(marker, `${isoNow()} from ${context.legacyDir}\n`);
  await appendAudit(context, 'legacy.migrate', { from: context.legacyDir, files: files.length });
}

async function regenerateIndex(context: Context): Promise<AnyRecord> {
  const entriesDir = path.join(context.storeDir, 'entries');
  const names = existsSync(entriesDir) ? await readdir(entriesDir) : [];
  const entries = [];
  const tags: AnyRecord = {};
  const types: AnyRecord = {};
  for (const name of names) {
    if (!name.endsWith('.yaml') || name.startsWith('_')) continue;
    const entry = parseLooseYaml(await readFile(path.join(entriesDir, name), 'utf8'));
    if (!entry.id) entry.id = name.replace(/\.yaml$/, '');
    entries.push(indexEntry(entry));
    types[entry.type] = [...(types[entry.type] || []), entry.id];
    for (const tag of entry.tags || []) {
      tags[tag] = [...(tags[tag] || []), entry.id];
    }
  }
  entries.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const index = { updated: isoNow(), entries, tags, types };
  await writeJson(path.join(context.storeDir, 'index.json'), index);
  return index;
}

async function getIndex(context: Context): Promise<AnyRecord> {
  const indexPath = path.join(context.storeDir, 'index.json');
  if (!existsSync(indexPath)) return regenerateIndex(context);
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  if (!Array.isArray(index.entries)) return regenerateIndex(context);
  return index;
}

function emptyIndex(now: string): AnyRecord {
  return { updated: now, entries: [], tags: {}, types: {} };
}

function normalizeEntry(context: Context, draft: AnyRecord): AnyRecord {
  const now = isoNow();
  const type = ENTRY_TYPES.includes(draft.type) ? draft.type : 'pattern';
  const summary = String(draft.summary || draft.rule || draft.question || draft.approach || 'Untitled priors entry').trim();
  const id = draft.id && safeIdPattern().test(String(draft.id))
    ? String(draft.id)
    : `${dateOnly(now)}-${timeOnly(now)}-${type}-${slugify(summary).slice(0, 48) || 'entry'}`;
  return {
    id,
    type,
    created: draft.created || now,
    valid_from: draft.valid_from || dateOnly(now),
    valid_through: draft.valid_through === undefined ? null : draft.valid_through,
    summary,
    tags: asStringArray(draft.tags),
    source: normalizeSource(context, draft.source),
    confidence: CONFIDENCE.includes(draft.confidence) ? draft.confidence : 'medium',
    helpful_count: integerOr(draft.helpful_count, 0),
    contradicted_count: integerOr(draft.contradicted_count, 0),
    status: STATUS.includes(draft.status) ? draft.status : 'active',
    supersedes: asStringArray(draft.supersedes),
    superseded_by: asStringArray(draft.superseded_by),
    links: asStringArray(draft.links),
    contradiction_of: draft.contradiction_of || null,
    activation_score: typeof draft.activation_score === 'number' ? draft.activation_score : DEFAULT_ACTIVATION_SCORE,
    last_used_at: draft.last_used_at === undefined ? null : draft.last_used_at,
    decay_half_life_days: typeof draft.decay_half_life_days === 'number' ? draft.decay_half_life_days : 30,
    retrieval_policy: draft.retrieval_policy || RETRIEVAL_POLICY,
    ...withoutBaseFields(draft)
  };
}

function withoutBaseFields(input: AnyRecord): AnyRecord {
  const omitted = new Set([
    'id', 'type', 'created', 'valid_from', 'valid_through', 'summary', 'tags', 'source', 'confidence',
    'helpful_count', 'contradicted_count', 'status', 'supersedes', 'superseded_by', 'links', 'contradiction_of',
    'activation_score', 'last_used_at', 'decay_half_life_days', 'retrieval_policy'
  ]);
  return Object.fromEntries(Object.entries(input).filter(([key]) => !omitted.has(key)));
}

function normalizeSource(context: Context, source: AnyRecord = {}): AnyRecord {
  return {
    session: source.session ?? null,
    commit: source.commit ?? gitMaybe(context.projectRoot, ['rev-parse', '--short', 'HEAD']),
    pr: source.pr ?? null,
    files: asStringArray(source.files)
  };
}

function validateEntry(entry: AnyRecord): { ok: boolean; errors: string[] } {
  const errors = [];
  if (!safeIdPattern().test(String(entry.id || ''))) errors.push('id must match priors entry id format');
  if (!ENTRY_TYPES.includes(entry.type)) errors.push('type is invalid');
  for (const field of ['created', 'valid_from', 'summary', 'tags', 'source', 'confidence', 'helpful_count', 'contradicted_count', 'status', 'supersedes', 'superseded_by']) {
    if (entry[field] === undefined) errors.push(`${field} is required`);
  }
  if (!Array.isArray(entry.tags)) errors.push('tags must be an array');
  if (!entry.source || !Array.isArray(entry.source.files)) errors.push('source.files must be an array');
  if (!CONFIDENCE.includes(entry.confidence)) errors.push('confidence must be low, medium, or high');
  if (!STATUS.includes(entry.status)) errors.push('status must be active, archived, or superseded');
  if (entry.type === 'constraint' && !entry.enforcement && !entry.enforcement_target) errors.push('constraint requires enforcement or enforcement_target');
  return { ok: errors.length === 0, errors };
}

async function writeEntry(context: Context, entry: AnyRecord): Promise<void> {
  assertSafeId(entry.id);
  await atomicWrite(entryPath(context, entry.id), toLooseYaml(entry));
}

async function readEntry(context: Context, id: string): Promise<AnyRecord | null> {
  const file = entryPath(context, id);
  if (!existsSync(file)) return null;
  return parseLooseYaml(await readFile(file, 'utf8'));
}

async function readEntryText(context: Context, id: string): Promise<string> {
  assertSafeId(id);
  return readFile(entryPath(context, id), 'utf8');
}

function entryPath(context: Context, id: string): string {
  assertSafeId(id);
  return path.join(context.storeDir, 'entries', `${id}.yaml`);
}

function indexEntry(entry: AnyRecord): AnyRecord {
  const activation = decayedActivation(entry);
  return {
    id: entry.id,
    type: entry.type,
    created: entry.created,
    summary: entry.summary,
    tags: asStringArray(entry.tags),
    sourceFiles: asStringArray(entry.source?.files),
    confidence: entry.confidence,
    status: entry.status,
    valid_from: entry.valid_from,
    valid_through: entry.valid_through,
    helpful_count: integerOr(entry.helpful_count, 0),
    contradicted_count: integerOr(entry.contradicted_count, 0),
    activation_score: typeof entry.activation_score === 'number' ? entry.activation_score : 0,
    decayed_activation_score: roundActivation(activation),
    activation_state: activationState(entry, activation),
    last_used_at: entry.last_used_at ?? null,
    decay_half_life_days: integerOr(entry.decay_half_life_days, 30),
    retrieval_policy: entry.retrieval_policy || RETRIEVAL_POLICY,
    links: asStringArray(entry.links),
    supersedes: asStringArray(entry.supersedes),
    superseded_by: asStringArray(entry.superseded_by),
    contradiction_of: entry.contradiction_of || null
  };
}

function recallGate(args: AnyRecord, query: string, types: Set<string>, tags: Set<string>, pathQueries: string[]): AnyRecord {
  const uncertainty = UNCERTAINTY.includes(args.uncertainty) ? args.uncertainty : 'high';
  const force = Boolean(args.force);
  const hasRetrievalSignal = Boolean(query || types.size > 0 || tags.size > 0 || pathQueries.length > 0);
  if (force) return { shouldRead: true, uncertainty, force, hasRetrievalSignal, reason: 'forced' };
  if (!hasRetrievalSignal) return { shouldRead: false, uncertainty, force, hasRetrievalSignal, reason: 'no retrieval signal' };
  if (uncertainty === 'low') return { shouldRead: false, uncertainty, force, hasRetrievalSignal, reason: 'uncertainty below recall threshold' };
  return { shouldRead: true, uncertainty, force, hasRetrievalSignal, reason: 'uncertainty threshold met' };
}

function recallScore(entry: AnyRecord, query: string, tags: Set<string>, pathQueries: string[], activation: number): number {
  let score = Number(activation || 0);
  const haystack = [entry.id, entry.summary, ...(entry.tags || []), ...(entry.sourceFiles || [])].join(' ').toLowerCase();
  if (query && haystack.includes(query)) score += 10;
  for (const tag of tags) if ((entry.tags || []).includes(tag)) score += 3;
  for (const pathQuery of pathQueries) if ((entry.sourceFiles || []).some((file: string) => file.includes(pathQuery))) score += 5;
  return score;
}

function directRecallMatch(entry: AnyRecord, query: string, tags: Set<string>, pathQueries: string[]): boolean {
  const haystack = [entry.id, entry.summary, ...(entry.tags || []), ...(entry.sourceFiles || [])].join(' ').toLowerCase();
  if (query && haystack.includes(query)) return true;
  for (const tag of tags) if ((entry.tags || []).includes(tag)) return true;
  for (const pathQuery of pathQueries) if ((entry.sourceFiles || []).some((file: string) => file.includes(pathQuery))) return true;
  return false;
}

function decayedActivation(entry: AnyRecord, now = Date.now()): number {
  const base = typeof entry.activation_score === 'number' ? entry.activation_score : 0;
  if (base <= 0) return 0;
  const anchor = Date.parse(entry.last_used_at || entry.created || entry.valid_from || '');
  if (!Number.isFinite(anchor)) return base;
  const halfLifeDays = Math.max(1, Number(entry.decay_half_life_days || 30));
  const elapsedDays = Math.max(0, (now - anchor) / (24 * 60 * 60 * 1000));
  return base * Math.pow(0.5, elapsedDays / halfLifeDays);
}

function activationState(entry: AnyRecord, activation: number): string {
  if (entry.status === 'archived' || entry.status === 'superseded') return entry.status;
  return activation < LATENT_ACTIVATION_THRESHOLD ? 'latent' : 'active';
}

function roundActivation(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, value).toFixed(4));
}

async function loadProposals(context: Context, args: AnyRecord): Promise<AnyRecord[]> {
  const proposals = [];
  for (const supplied of args.proposals || []) proposals.push(supplied);
  for (const id of args.proposalIds || []) {
    assertSafeId(id);
    const file = path.join(context.storeDir, 'staging', `${id}.json`);
    if (!existsSync(file)) throw new Error(`Proposal not found: ${id}`);
    proposals.push(JSON.parse(await readFile(file, 'utf8')));
  }
  if (proposals.length === 0) {
    const names = await readdir(path.join(context.storeDir, 'staging'));
    for (const name of names.filter((name) => name.endsWith('.json'))) {
      proposals.push(JSON.parse(await readFile(path.join(context.storeDir, 'staging', name), 'utf8')));
    }
  }
  return proposals;
}

async function readTranscript(context: Context, args: AnyRecord, optional = false): Promise<string> {
  if (typeof args.transcriptText === 'string') return args.transcriptText;
  const transcriptPath = args.transcriptPath || args.transcriptRef;
  if (transcriptPath) {
    const absolute = path.resolve(context.projectRoot, String(transcriptPath));
    assertProjectPath(context.projectRoot, absolute);
    return readFile(absolute, 'utf8');
  }
  if (optional) return '';
  throw new Error('transcriptText or transcriptPath is required');
}

function classifyTranscriptLine(line: string): string | null {
  const lower = line.toLowerCase();
  if (/\b(dead[- ]end|did not work|didn't work|failed because|failure)\b/.test(lower)) return 'dead-end';
  if (/\b(correction|wrong|mistake|instead|recovered|recovery|fixed by)\b/.test(lower)) return 'correction';
  if (/\b(decided|decision|chose|choose)\b/.test(lower)) return 'decision';
  if (/\b(constraint|must not|never|do not|forbid|forbidden|required)\b/.test(lower)) return 'constraint';
  if (/\b(pattern|works well|use this approach|optimi[sz]e|optimization|inefficient|token|latency|bloat)\b/.test(lower)) return 'pattern';
  if (/\b(open question|deferred|decide later)\b/.test(lower)) return 'open-question';
  return null;
}

function isActionableTrajectoryLine(line: string, type: string): boolean {
  const lower = line.toLowerCase();
  if (type === 'constraint') return /\b(must|must not|never|do not|forbid|required|only|reject)\b/.test(lower);
  if (type === 'decision') return /\b(decided|decision|chose|choose|because|so that|therefore)\b/.test(lower);
  if (type === 'dead-end') return /\b(failed|failure|did not work|didn't work|dead[- ]end|because|conclusion|retry)\b/.test(lower);
  if (type === 'correction') return /\b(instead|correct|correction|wrong|mistake|recover|recovered|fixed by|should)\b/.test(lower);
  if (type === 'pattern') return /\b(use|prefer|avoid|pattern|approach|works well|optimi[sz]e|reduce|token|latency|bloat|when)\b/.test(lower);
  if (type === 'open-question') return /\b(open question|deferred|decide later|watch for)\b/.test(lower);
  return false;
}

function isActionableEntry(entry: AnyRecord): boolean {
  if (entry.trajectory?.actionable === true) return true;
  if (entry.type === 'constraint' && (entry.rule || entry.enforcement || entry.enforcement_target)) return true;
  if (entry.type === 'decision' && entry.chosen) return true;
  if (entry.type === 'dead-end' && (entry.failure || entry.conclusion)) return true;
  if (entry.type === 'correction' && (entry.correct_approach || entry.why || entry.symptom)) return true;
  if (entry.type === 'pattern' && entry.approach) return true;
  return isActionableTrajectoryLine(String(entry.summary || ''), String(entry.type || ''));
}

function trajectoryFieldsFromLine(line: string, type: string): AnyRecord {
  return {
    actionable: true,
    role: trajectoryRole(line, type),
    extractor: 'trajectory-intelligence',
    decision_attribution: decisionAttribution(line, type),
    storage_reason: 'failure, recovery, optimization, constraint, or decision signal'
  };
}

function trajectoryRole(line: string, type: string): string {
  const lower = line.toLowerCase();
  if (type === 'dead-end' || /\b(failed|failure|dead[- ]end)\b/.test(lower)) return 'failure';
  if (type === 'correction' || /\b(recovered|recovery|instead|fixed by)\b/.test(lower)) return 'recovery';
  if (/\b(optimi[sz]e|optimization|inefficient|token|latency|bloat)\b/.test(lower)) return 'optimization';
  if (type === 'constraint') return 'constraint';
  if (type === 'decision') return 'decision';
  return 'strategy';
}

function decisionAttribution(line: string, type: string): AnyRecord {
  const lower = line.toLowerCase();
  let signal = 'explicit-agent-trajectory';
  if (/\bbecause\b/.test(lower)) signal = 'causal-language';
  else if (/\binstead\b/.test(lower)) signal = 'correction-language';
  else if (/\btoken|latency|bloat|inefficient\b/.test(lower)) signal = 'efficiency-language';
  return {
    signal,
    entry_type: type,
    contribution: summarizeLine(line)
  };
}

function constraintFieldsFromLine(line: string): AnyRecord {
  return {
    rule: line,
    enforcement: {
      type: 'agent-gate',
      matcher: '*',
      condition: 'review-required',
      message: line
    },
    applies_when: { paths: inferFiles(line), tags: inferTags(line) },
    derived_from: null,
    why: line
  };
}

function buildEmission(context: Context, entry: AnyRecord, artifact: string): AnyRecord {
  const id = `emission-${entry.id}-${artifact}-${createHash('sha256').update(`${entry.id}:${artifact}:${isoNow()}`).digest('hex').slice(0, 8)}`;
  const targets: Record<string, string> = {
    'pre-commit': `.githooks/priors/${entry.id}.sh`,
    lint: `scripts/priors/${entry.id}.lint.json`,
    test: `tests/priors/${entry.id}.test.json`,
    opa: `scripts/priors/${entry.id}.rego`,
    'agent-gate': `scripts/priors/${entry.id}.gate.json`
  };
  if (!targets[artifact]) throw new Error(`Unsupported artifact: ${artifact}`);
  const content = artifact === 'pre-commit'
    ? [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        `echo ${JSON.stringify(`Priors constraint ${entry.id}: ${entry.summary}`)} >&2`,
        'exit 0',
        ''
      ].join('\n')
    : JSON.stringify({
        schema: 'priors.emission.v1',
        artifact,
        entry_id: entry.id,
        summary: entry.summary,
        rule: entry.rule || entry.summary,
        enforcement: entry.enforcement || entry.enforcement_target || null,
        generated_at: isoNow()
      }, null, 2);
  return {
    id,
    entryId: entry.id,
    artifact,
    mode: 'preview',
    targetPath: targets[artifact],
    content,
    created: isoNow(),
    applyRequiresApprovalToken: APPLY_TOKEN,
    security: {
      allowlistedTarget: isAllowedEmissionPath(targets[artifact]),
      directGitHooksWrite: false,
      arbitraryShellFromModelText: false
    }
  };
}

function isAllowedEmissionPath(targetPath: string): boolean {
  if (path.isAbsolute(targetPath)) return false;
  const normalized = targetPath.replace(/\\/g, '/');
  if (normalized.includes('..') || normalized.startsWith('.git/') || normalized === '.mcp.json' || normalized.endsWith('/.mcp.json')) return false;
  return normalized.startsWith('.githooks/priors/')
    || normalized.startsWith('scripts/priors/')
    || normalized.startsWith('tests/priors/')
    || normalized.startsWith('.config/priors/');
}

function duplicateCandidates(entries: AnyRecord[]): AnyRecord[] {
  const duplicates = [];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const left = entries[i];
      const right = entries[j];
      const sharedTags = (left.tags || []).filter((tag: string) => (right.tags || []).includes(tag));
      if (sharedTags.length >= 2 && lexicalOverlap(left.summary, right.summary) >= 0.6) {
        duplicates.push({ left: left.id, right: right.id, sharedTags, summaryOverlap: lexicalOverlap(left.summary, right.summary) });
      }
    }
  }
  return duplicates;
}

async function appendAudit(context: Context, action: string, details: AnyRecord): Promise<void> {
  await mkdir(path.join(context.storeDir, 'audit'), { recursive: true });
  const event = { id: `audit-${Date.now()}-${randomUUID().slice(0, 8)}`, at: isoNow(), action, details };
  const file = path.join(context.storeDir, 'audit', 'events.jsonl');
  const existing = existsSync(file) ? await readFile(file, 'utf8') : '';
  await atomicWrite(file, `${existing}${JSON.stringify(event)}\n`);
}

async function findAuditEvent(context: Context, id: string): Promise<AnyRecord> {
  const file = path.join(context.storeDir, 'audit', 'events.jsonl');
  if (!existsSync(file)) throw new Error(`Audit event not found: ${id}`);
  for (const line of (await readFile(file, 'utf8')).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.id === id) return event;
  }
  throw new Error(`Audit event not found: ${id}`);
}

function parseLooseYaml(text: string): AnyRecord {
  const result: AnyRecord = {};
  let parent: string | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;
    const top = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(rawLine);
    if (top) {
      parent = top[1];
      result[parent] = top[2] === '' ? {} : parseLooseValue(top[2]);
      continue;
    }
    const nested = /^\s+([A-Za-z0-9_-]+):\s*(.*)$/.exec(rawLine);
    if (nested && parent) {
      if (!result[parent] || typeof result[parent] !== 'object' || Array.isArray(result[parent])) result[parent] = {};
      result[parent][nested[1]] = parseLooseValue(nested[2]);
    }
  }
  return result;
}

function parseLooseValue(value: string): any {
  const trimmed = value.trim();
  if (trimmed === 'null') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1).replace(/''/g, "'");
  return trimmed;
}

function toLooseYaml(value: AnyRecord): string {
  const preferred = [
    'id', 'type', 'created', 'valid_from', 'valid_through', 'summary', 'tags', 'source', 'confidence',
    'helpful_count', 'contradicted_count', 'status', 'supersedes', 'superseded_by', 'links', 'contradiction_of',
    'activation_score', 'last_used_at', 'decay_half_life_days', 'retrieval_policy'
  ];
  const keys = [...preferred.filter((key) => key in value), ...Object.keys(value).filter((key) => !preferred.includes(key)).sort()];
  return `${keys.map((key) => `${key}: ${formatYamlScalar(value[key])}`).join('\n')}\n`;
}

function formatYamlScalar(value: any): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

async function writeJson(filePath: string, value: AnyRecord): Promise<void> {
  await atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, filePath);
}

async function walkFiles(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const output: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await readdir(current);
    for (const entry of entries) {
      const absolute = path.join(current, entry);
      const info = await stat(absolute);
      if (info.isDirectory()) await walk(absolute);
      else if (info.isFile()) output.push(absolute);
    }
  }
  await walk(root);
  return output;
}

function resource(uri: string, name: string, description: string, mimeType: string): AnyRecord {
  return { uri, name, description, mimeType };
}

function assertProjectPath(projectRoot: string, candidate: string): void {
  const relative = path.relative(path.resolve(projectRoot), path.resolve(candidate));
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Path escapes project root: ${candidate}`);
}

function assertSafeId(id: string): void {
  if (!safeGenericIdPattern().test(String(id || ''))) throw new Error(`Unsafe id: ${id}`);
}

function safeIdPattern(): RegExp {
  return /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}-(correction|constraint|pattern|decision|dead-end|operator|open-question)-[a-z0-9-]+$/;
}

function safeGenericIdPattern(): RegExp {
  return /^[A-Za-z0-9._-]+$/;
}

function gitMaybe(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

function inferTags(text: string): string[] {
  const tags = new Set<string>();
  const lower = text.toLowerCase();
  for (const tag of ['testing', 'database', 'auth', 'ui', 'build', 'ci', 'security', 'mcp', 'memory', 'constraint', 'trajectory', 'recovery', 'optimization', 'tokens', 'latency']) {
    if (lower.includes(tag)) tags.add(tag);
  }
  if (tags.size === 0) tags.add('general');
  return [...tags].slice(0, 6);
}

function inferFiles(text: string): string[] {
  const matches = text.match(/(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]+/g);
  return matches ? [...new Set(matches)] : [];
}

function summarizeLine(line: string): string {
  return line.replace(/^[-*]\s*/, '').slice(0, 140);
}

function slugify(input: string): string {
  return String(input).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-') || 'entry';
}

function isoNow(): string {
  return new Date().toISOString();
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function timeOnly(iso: string): string {
  return iso.slice(11, 16).replace(':', '');
}

function asStringArray(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

function integerOr(value: any, fallback: number): number {
  return Number.isInteger(value) ? value : fallback;
}

function clampNumber(value: any, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function mergePatch(base: AnyRecord, patch: AnyRecord): AnyRecord {
  const output = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete output[key];
    else if (typeof value === 'object' && !Array.isArray(value) && typeof output[key] === 'object' && !Array.isArray(output[key])) output[key] = mergePatch(output[key], value);
    else output[key] = value;
  }
  return output;
}

function normalizeText(text: string): string {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function sharesTag(left: AnyRecord, right: AnyRecord): boolean {
  return asStringArray(left.tags).some((tag) => asStringArray(right.tags).includes(tag));
}

function negationMismatch(left: string, right: string): boolean {
  const leftNeg = /\b(no|not|never|forbid|forbidden|must not)\b/i.test(left);
  const rightNeg = /\b(no|not|never|forbid|forbidden|must not)\b/i.test(right);
  return leftNeg !== rightNeg;
}

function lexicalOverlap(left: string, right: string): number {
  const leftWords = new Set(normalizeText(left).split(/\W+/).filter(Boolean));
  const rightWords = new Set(normalizeText(right).split(/\W+/).filter(Boolean));
  const smaller = Math.min(leftWords.size, rightWords.size);
  if (smaller === 0) return 0;
  let shared = 0;
  for (const word of leftWords) if (rightWords.has(word)) shared += 1;
  return shared / smaller;
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rpcError(code: number, message: string): AnyRecord {
  return { code, message };
}

function writeRpc(value: AnyRecord): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
