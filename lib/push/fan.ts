import { displaySlug } from "@/lib/avatar/store";
import { notifyBody, NOTIFY_TAG, type NotifyPayload } from "@/lib/phone/notify";
import type { PushSendResult } from "./send";
import type { PushSub, StoredPush } from "./subscription";
import { shouldWebPush, webPushUserIds } from "./target";

export function pushPayload(
  frame: { text?: string; images?: { url?: string }[] },
  title: string,
): NotifyPayload {
  return {
    title: displaySlug(title),
    body: notifyBody(frame.text, Boolean(frame.images?.[0]?.url)),
    tag: NOTIFY_TAG,
  };
}

export async function fanWebPush(opts: {
  frame: { kind?: string; text?: string; images?: { url?: string }[]; user_id?: string };
  title: string;
  live: ReadonlySet<string>;
  stored: readonly StoredPush[];
  send: (subscription: PushSub, payload: NotifyPayload) => Promise<PushSendResult>;
}): Promise<{ gone: StoredPush[] }> {
  if (!shouldWebPush(opts.frame.kind)) {
    return { gone: [] };
  }
  const want = new Set(webPushUserIds({
    frameUserId: opts.frame.user_id,
    live: opts.live,
    storedUserIds: opts.stored.map((row) => row.userId),
  }));
  if (want.size === 0) {
    return { gone: [] };
  }
  const payload = pushPayload(opts.frame, opts.title);
  const gone: StoredPush[] = [];
  for (const row of opts.stored) {
    if (!want.has(row.userId)) {
      continue;
    }
    const result = await opts.send(row.subscription, payload);
    if (result === "gone") {
      gone.push(row);
    }
  }
  return { gone };
}
