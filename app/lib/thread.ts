export const THREAD_MAX = 500;
export const SEEN_MAX = 500;

export type ThreadOrder = {
  id: string;
  at: number;
  seq?: number;
  kind?: string;
};

export type ThreadCursor = {
  id?: string;
  seq: number;
};

export function capThread<T>(messages: T[], max = THREAD_MAX): T[] {
  return messages.length > max ? messages.slice(-max) : messages;
}

/** Drop oldest ids first (Set insertion order) so a long-lived tab cannot grow forever. */
export function rememberSeen(seen: Set<string>, id: string, max = SEEN_MAX): void {
  seen.add(id);
  if (seen.size <= max) {
    return;
  }
  const extra = seen.size - max;
  let n = 0;
  for (const key of seen) {
    seen.delete(key);
    n += 1;
    if (n >= extra) {
      break;
    }
  }
}

export function isDraftBubble(m: Pick<ThreadOrder, "kind">): boolean {
  return m.kind === "draft";
}

/** Seq first, then mailbox time, then id. Drafts stay last so catch-up cannot leapfrog typing. */
export function compareThread(a: ThreadOrder, b: ThreadOrder): number {
  const aDraft = isDraftBubble(a);
  const bDraft = isDraftBubble(b);
  if (aDraft !== bDraft) {
    return aDraft ? 1 : -1;
  }
  if (a.seq != null && b.seq != null && a.seq !== b.seq) {
    return a.seq - b.seq;
  }
  if (a.at !== b.at) {
    return a.at - b.at;
  }
  return a.id.localeCompare(b.id);
}

export function placeInThread<T extends ThreadOrder>(messages: T[], bubble: T): T[] {
  const next = messages.filter((m) => m.id !== bubble.id);
  next.push(bubble);
  next.sort(compareThread);
  return next;
}

export function advanceCursor(current: ThreadCursor, next: { id?: string; seq?: number }): ThreadCursor {
  if (next.seq != null && next.seq >= current.seq) {
    return { id: next.id ?? current.id, seq: next.seq };
  }
  if (next.seq == null && next.id) {
    return { id: next.id, seq: current.seq };
  }
  return current;
}

export function ackSince(cursor: ThreadCursor): string | undefined {
  if (cursor.seq > 0) {
    return String(cursor.seq);
  }
  return cursor.id;
}
