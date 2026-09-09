import { QUEUE_BYTES_MAX, QUEUE_MAX, QUEUE_TTL_MS } from "./caps";
import type { Role } from "./frame";

export const QUEUE_STORE_PREFIX = "q:";

export type Queued = {
  id: string;
  to: Role;
  body: string;
  at: number;
  userId?: string;
  kind?: string;
  bytes: number;
};

export function queueStoreKey(id: string, to: Role): string {
  return `${QUEUE_STORE_PREFIX}${to}:${id}`;
}

export function queueIdentity(item: Pick<Queued, "id" | "to">): string {
  return `${item.to}:${item.id}`;
}

export function shouldQueue(kind?: string): boolean {
  return kind !== "pin" && kind !== "ack" && kind !== "cmds" && kind !== "typing" && kind !== "draft";
}

export function destKey(to: Role, userId?: string): string {
  return `${to}:${userId ?? ""}`;
}

function destOf(item: Queued): string {
  return destKey(item.to, item.userId);
}

function older(a: Queued, b: Queued): boolean {
  return a.at < b.at || (a.at === b.at && a.id < b.id);
}

function bytesOf(items: Queued[]): number {
  let n = 0;
  for (const m of items) {
    n += m.bytes;
  }
  return n;
}

/** Oldest non-reply first; replies only if nothing else remains. */
function evictIndex(mine: Queued[]): number {
  let bestNonReply = -1;
  let bestAny = -1;
  for (let i = 0; i < mine.length; i++) {
    const m = mine[i];
    if (!m) {
      continue;
    }
    if (bestAny < 0 || older(m, mine[bestAny]!)) {
      bestAny = i;
    }
    if (m.kind !== "reply" && (bestNonReply < 0 || older(m, mine[bestNonReply]!))) {
      bestNonReply = i;
    }
  }
  return bestNonReply >= 0 ? bestNonReply : bestAny;
}

export function pruneQueue(items: Queued[], now: number, ttlMs = QUEUE_TTL_MS): Queued[] {
  return items.filter((m) => now - m.at <= ttlMs);
}

export function queuedFromList(rows: Iterable<[string, Queued]>): Queued[] {
  const items: Queued[] = [];
  for (const [, value] of rows) {
    items.push(value);
  }
  items.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  return items;
}

export function enqueue(
  items: Queued[],
  msg: Queued,
  opts: { now: number; max?: number; ttlMs?: number; bytesMax?: number } = { now: Date.now() },
): Queued[] {
  const max = opts.max ?? QUEUE_MAX;
  const ttl = opts.ttlMs ?? QUEUE_TTL_MS;
  const cap = opts.bytesMax ?? QUEUE_BYTES_MAX;
  const live = pruneQueue([...items, msg], opts.now, ttl);
  const key = destOf(msg);
  const mine = live.filter((m) => destOf(m) === key);
  const keptMine = [...mine];
  while (keptMine.length > max || bytesOf(keptMine) > cap) {
    if (!keptMine.length) {
      break;
    }
    const i = evictIndex(keptMine);
    if (i < 0) {
      break;
    }
    keptMine.splice(i, 1);
  }
  const keep = new Set(keptMine.map((m) => m.id));
  return live.filter((m) => destOf(m) !== key || keep.has(m.id));
}

export function matchesFlush(item: Queued, to: Role, userId?: string): boolean {
  if (item.to !== to) {
    return false;
  }
  if (to === "crane") {
    return true;
  }
  const uid = item.userId ?? "";
  if (uid === "") {
    return true;
  }
  return userId != null && uid === userId;
}

function afterSince(item: Queued, since?: string): boolean {
  if (!since) {
    return true;
  }
  return item.id > since;
}

export function peekFor(
  items: Queued[],
  to: Role,
  now: number,
  opts: { ttlMs?: number; userId?: string; since?: string } = {},
): Queued[] {
  const ttl = opts.ttlMs ?? QUEUE_TTL_MS;
  const live = pruneQueue(items, now, ttl);
  return live.filter((m) => matchesFlush(m, to, opts.userId) && afterSince(m, opts.since));
}

export function drainFor(
  items: Queued[],
  to: Role,
  now: number,
  ttlMs = QUEUE_TTL_MS,
  userId?: string,
): { kept: Queued[]; take: Queued[] } {
  const live = pruneQueue(items, now, ttlMs);
  const take = live.filter((m) => matchesFlush(m, to, userId));
  const kept = live.filter((m) => !matchesFlush(m, to, userId));
  return { kept, take };
}

export function newQueueId(now = Date.now(), rand = Math.random): string {
  return `${now.toString(36)}-${Math.floor(rand() * 1e9).toString(36)}`;
}
