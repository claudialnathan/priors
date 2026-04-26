import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initProject } from "../../src/store/project.ts";
import { writeEntry, writeStagedEntry } from "../../src/store/entries.ts";
import { regenerateIndex } from "../../src/store/index.ts";
import { fixedClock } from "../../src/util/clock.ts";
import type { Clock } from "../../src/util/clock.ts";
import type {
  Entry,
  EntryConfidence,
  EntryKind,
  EntryStatus,
  EntryRelations,
} from "../../src/schema/entry.ts";

const FIXED_TS = "2026-04-26T00:00:00Z";
const FIXED_DATE = "2026-04-26";

export const FIXED_CLOCK_ISO = FIXED_TS;

export interface TempStore {
  root: string;
  clock: Clock;
  cleanup: () => Promise<void>;
}

export async function makeTempStore(
  opts: { name?: string; iso?: string } = {},
): Promise<TempStore> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "priors-test-"));
  const clock = fixedClock(opts.iso ?? FIXED_TS);
  await initProject(root, { name: opts.name ?? "test-fixture", clock });
  return {
    root,
    clock,
    cleanup: async () => {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

export async function withTempStore<T>(
  fn: (root: string, clock: Clock) => Promise<T>,
  opts: { name?: string; iso?: string } = {},
): Promise<T> {
  const t = await makeTempStore(opts);
  try {
    return await fn(t.root, t.clock);
  } finally {
    await t.cleanup();
  }
}

export interface SeedEntryFields {
  id: string;
  kind: EntryKind;
  claim: string;
  status?: EntryStatus;
  confidence?: EntryConfidence;
  tags?: string[];
  body?: string;
  relations?: Partial<EntryRelations>;
  as_of?: string;
  created_at?: string;
  updated_at?: string;
  source_ref?: string;
  stale_reason?: string;
  staged?: boolean;
}

export async function seedEntry(
  root: string,
  clock: Clock,
  fields: SeedEntryFields,
): Promise<Entry> {
  const ts = fields.updated_at ?? FIXED_TS;
  const created = fields.created_at ?? ts;
  const entry: Entry = {
    frontmatter: {
      id: fields.id,
      kind: fields.kind,
      status: fields.status ?? "active",
      confidence: fields.confidence ?? "medium",
      claim: fields.claim,
      as_of: fields.as_of ?? FIXED_DATE,
      created_at: created,
      updated_at: ts,
      relations: {
        supersedes: fields.relations?.supersedes ?? [],
        contradicts: fields.relations?.contradicts ?? [],
        reinforces: fields.relations?.reinforces ?? [],
        derived_from: fields.relations?.derived_from ?? [],
      },
      tags: fields.tags ?? [],
      ...(fields.source_ref !== undefined ? { source_ref: fields.source_ref } : {}),
      ...(fields.stale_reason !== undefined
        ? { stale_reason: fields.stale_reason }
        : {}),
    },
    body: fields.body ?? `\n## Notes\n\nSeeded for ${fields.id}.\n`,
  };
  if (fields.staged) {
    await writeStagedEntry(root, entry);
  } else {
    await writeEntry(root, entry);
  }
  await regenerateIndex(root, { clock });
  return entry;
}
