export const THREAD_MAX = 500;
export const SEEN_MAX = 500;

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
