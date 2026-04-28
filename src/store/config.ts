import fs from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "../util/atomic-write.ts";
import { priorsRoot } from "./paths.ts";

export type GroundingMode = "strict" | "warn";

/** Auto: agents may auto-log at meaningful checkpoints. Manual: writes only on explicit user ask. */
export type PriorsMode = "auto" | "manual";

export const PRIORS_MODES: readonly PriorsMode[] = ["auto", "manual"] as const;

export interface PriorsConfig {
  groundingMode: GroundingMode;
  commitThreshold: number;
  mode: PriorsMode;
}

export const DEFAULT_CONFIG: PriorsConfig = {
  groundingMode: "strict",
  commitThreshold: 0.0,
  mode: "auto",
};

export function configPath(projectRoot: string): string {
  return path.join(priorsRoot(projectRoot), "config.json");
}

export async function readConfig(projectRoot: string): Promise<PriorsConfig> {
  let text: string;
  try {
    text = await fs.readFile(configPath(projectRoot), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_CONFIG };
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `priors: ${configPath(projectRoot)} is not valid JSON: ${(err as Error).message}`,
    );
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`priors: ${configPath(projectRoot)} must be an object`);
  }
  const r = raw as Record<string, unknown>;
  const allowed = new Set(["groundingMode", "commitThreshold", "mode"]);
  for (const key of Object.keys(r)) {
    if (!allowed.has(key)) {
      throw new Error(`priors config: unknown field ${key}`);
    }
  }
  const out: PriorsConfig = { ...DEFAULT_CONFIG };
  if (r["groundingMode"] !== undefined) {
    if (r["groundingMode"] !== "strict" && r["groundingMode"] !== "warn") {
      throw new Error(`priors config: groundingMode must be "strict" or "warn"`);
    }
    out.groundingMode = r["groundingMode"];
  }
  if (r["commitThreshold"] !== undefined) {
    const v = r["commitThreshold"];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
      throw new Error(`priors config: commitThreshold must be a number in [0, 1]`);
    }
    out.commitThreshold = v;
  }
  if (r["mode"] !== undefined) {
    if (r["mode"] !== "auto" && r["mode"] !== "manual") {
      throw new Error(`priors config: mode must be "auto" or "manual"`);
    }
    out.mode = r["mode"];
  }
  return out;
}

export async function writeConfig(
  projectRoot: string,
  config: PriorsConfig,
): Promise<void> {
  const ordered = {
    mode: config.mode,
    groundingMode: config.groundingMode,
    commitThreshold: config.commitThreshold,
  };
  await atomicWrite(configPath(projectRoot), `${JSON.stringify(ordered, null, 2)}\n`);
}

export async function setMode(
  projectRoot: string,
  mode: PriorsMode,
): Promise<PriorsConfig> {
  const cfg = await readConfig(projectRoot);
  cfg.mode = mode;
  await writeConfig(projectRoot, cfg);
  return cfg;
}
