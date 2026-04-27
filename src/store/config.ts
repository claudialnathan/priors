import fs from "node:fs/promises";
import path from "node:path";
import { priorsRoot } from "./paths.ts";

export type GroundingMode = "strict" | "warn";

export interface PriorsConfig {
  groundingMode: GroundingMode;
  commitThreshold: number;
}

export const DEFAULT_CONFIG: PriorsConfig = {
  groundingMode: "strict",
  commitThreshold: 0.0,
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
  const allowed = new Set(["groundingMode", "commitThreshold"]);
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
  return out;
}
