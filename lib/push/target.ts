/** Lock-screen Web Push only for crane push/reply, and only when that phone socket is gone. */

export function shouldWebPush(kind?: string): boolean {
  return kind === "push" || kind === "reply";
}

export function webPushUserIds(opts: {
  frameUserId?: string;
  live: ReadonlySet<string>;
  storedUserIds: readonly string[];
}): string[] {
  const want = opts.frameUserId
    ? [opts.frameUserId]
    : [...new Set(opts.storedUserIds.filter(Boolean))];
  return want.filter((id) => id && !opts.live.has(id));
}
