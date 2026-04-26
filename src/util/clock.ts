export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export function fixedClock(iso: string): Clock {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`fixedClock: invalid ISO ${iso}`);
  return { now: () => new Date(ms) };
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isoDatetime(d: Date): string {
  return new Date(Math.floor(d.getTime() / 1000) * 1000).toISOString();
}
