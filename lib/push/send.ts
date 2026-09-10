import { buildPushHTTPRequest } from "@pushforge/builder";
import { NOTIFY_ICON, NOTIFY_TAG, type NotifyPayload } from "@/lib/phone/notify";
import { QUEUE_TTL_MS } from "@/lib/mailbox/caps";
import type { PushSub } from "./subscription";
import type { VapidCreds } from "./vapid";

export type PushSendResult = "ok" | "gone" | "fail";

export const PUSH_TTL_SEC = Math.floor(QUEUE_TTL_MS / 1000);

export async function sendWebPush(opts: {
  vapid: VapidCreds;
  subscription: PushSub;
  payload: NotifyPayload;
  fetch: typeof fetch;
}): Promise<PushSendResult> {
  let endpoint: string;
  let headers: HeadersInit;
  let body: BodyInit;
  try {
    const built = await buildPushHTTPRequest({
      privateJWK: opts.vapid.privateJwk,
      subscription: opts.subscription,
      message: {
        payload: {
          title: opts.payload.title,
          body: opts.payload.body,
          tag: opts.payload.tag ?? NOTIFY_TAG,
          icon: opts.payload.icon ?? NOTIFY_ICON,
          badge: NOTIFY_ICON,
        },
        adminContact: opts.vapid.subject,
        options: { ttl: PUSH_TTL_SEC, urgency: "high" },
      },
    });
    endpoint = built.endpoint;
    headers = built.headers;
    body = built.body;
  } catch {
    return "fail";
  }
  try {
    const res = await opts.fetch(endpoint, { method: "POST", headers, body });
    if (res.status === 404 || res.status === 410) {
      return "gone";
    }
    if (res.status >= 200 && res.status < 300) {
      return "ok";
    }
    return "fail";
  } catch {
    return "fail";
  }
}
