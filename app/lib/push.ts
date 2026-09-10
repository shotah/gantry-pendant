import { vapidPublicKeyBytes } from "@/lib/push/vapid";
import { notifyPermission } from "./notify";

export async function browserSubscribePush(slug: string): Promise<boolean> {
  if (!slug) {
    return false;
  }
  if (notifyPermission() !== "granted") {
    return false;
  }
  if (typeof navigator === "undefined" || !navigator.serviceWorker) {
    return false;
  }
  if (typeof PushManager === "undefined") {
    return false;
  }
  try {
    const keyRes = await fetch("/api/push", { credentials: "include" });
    if (!keyRes.ok) {
      return false;
    }
    const json: unknown = await keyRes.json();
    const publicKey = json && typeof json === "object" && "publicKey" in json
      && typeof json.publicKey === "string"
      ? json.publicKey
      : "";
    const bytes = vapidPublicKeyBytes(publicKey);
    if (!bytes) {
      return false;
    }
    const applicationServerKey = new Uint8Array(bytes.byteLength);
    applicationServerKey.set(bytes);
    const reg = await navigator.serviceWorker.ready;
    if (!reg.pushManager) {
      return false;
    }
    const sub = await reg.pushManager.getSubscription()
      ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    const put = await fetch("/api/push", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, subscription: sub.toJSON() }),
    });
    return put.ok;
  } catch {
    return false;
  }
}
