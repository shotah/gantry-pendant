import { QUEUE_MAX, QUEUE_TTL_MS } from "./caps";
import type { Role } from "./frame";

export type Queued = {
  id: string;
  to: Role;
  body: string;
  at: number;
};

export function pruneQueue(items: Queued[], now: number, ttlMs = QUEUE_TTL_MS): Queued[] {
  return items.filter((m) => now - m.at <= ttlMs);
}

export function enqueue(
  items: Queued[],
  msg: Queued,
  opts: { now: number; max?: number; ttlMs?: number } = { now: Date.now() },
): Queued[] {
  const max = opts.max ?? QUEUE_MAX;
  const ttl = opts.ttlMs ?? QUEUE_TTL_MS;
  const next = pruneQueue([...items, msg], opts.now, ttl);
  if (next.length <= max) {
    return next;
  }
  return next.slice(next.length - max);
}

export function drainFor(
  items: Queued[],
  to: Role,
  now: number,
  ttlMs = QUEUE_TTL_MS,
): { kept: Queued[]; take: Queued[] } {
  const live = pruneQueue(items, now, ttlMs);
  const take = live.filter((m) => m.to === to);
  const kept = live.filter((m) => m.to !== to);
  return { kept, take };
}

export function newQueueId(now = Date.now(), rand = Math.random): string {
  return `${now.toString(36)}-${Math.floor(rand() * 1e9).toString(36)}`;
}
