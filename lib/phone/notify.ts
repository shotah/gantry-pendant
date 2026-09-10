/** Local OS toasts while the socket is up. Web Push (VAPID) is the lock-screen path. */

export type NotifyPermission = NotificationPermission | "unsupported";

export type NotifyPayload = {
  title: string;
  body: string;
  tag?: string;
  icon?: string;
};

export type NotifyApi = {
  permission?: unknown;
  requestPermission?: () => Promise<unknown> | unknown;
};

export type NotifyShower = {
  showNotification?: (title: string, opts?: NotificationOptions) => Promise<void> | void;
};

export type NotifyCtor = new (title: string, opts?: NotificationOptions) => unknown;

export const NOTIFY_ICON = "/icon-192.png";
export const NOTIFY_TAG = "pendant";
export const NOTIFY_TEST: NotifyPayload = {
  title: "pendant",
  body: "Notifications are on.",
};

const BODY_MAX = 140;

export function readNotifyPermission(api: NotifyApi | null | undefined): NotifyPermission {
  if (!api) {
    return "unsupported";
  }
  const value = api.permission;
  if (value === "granted" || value === "denied" || value === "default") {
    return value;
  }
  return "unsupported";
}

export function notifyNeedHomeScreen(ios: boolean, standalone: boolean): boolean {
  return ios && !standalone;
}

export function notifyHint(opts: {
  permission: NotifyPermission;
  needHomeScreen: boolean;
}): string {
  if (opts.needHomeScreen) {
    return "Install the app first, then enable.";
  }
  if (opts.permission === "unsupported") {
    return "Not available in this browser.";
  }
  if (opts.permission === "denied") {
    return "Blocked — enable in system settings.";
  }
  return "";
}

/** Unread lock-screen toast while the thread is hidden. Push and replies only. */
export function shouldNotify(
  hidden: boolean,
  kind: string | undefined,
  permission: NotifyPermission,
): boolean {
  return permission === "granted" && hidden && (kind === "push" || kind === "reply");
}

export function notifyBody(text: string | undefined, photo?: boolean): string {
  const t = text?.trim() ?? "";
  if (t) {
    return t.length > BODY_MAX ? `${t.slice(0, BODY_MAX - 1)}…` : t;
  }
  return photo ? "Photo" : "New message";
}

export async function requestNotifyPermission(api: NotifyApi | null | undefined): Promise<NotifyPermission> {
  if (!api || typeof api.requestPermission !== "function") {
    return "unsupported";
  }
  try {
    const result = await Promise.resolve(api.requestPermission());
    if (result === "granted" || result === "denied" || result === "default") {
      return result;
    }
  } catch {
    // keep whatever the OS already recorded
  }
  const current = readNotifyPermission(api);
  return current === "unsupported" ? "denied" : current;
}

export async function presentNotify(
  payload: NotifyPayload,
  opts: {
    permission: NotifyPermission;
    registration?: NotifyShower | null;
    Notification?: NotifyCtor;
  },
): Promise<boolean> {
  if (opts.permission !== "granted") {
    return false;
  }
  const options: NotificationOptions = {
    body: payload.body,
    tag: payload.tag ?? NOTIFY_TAG,
    icon: payload.icon ?? NOTIFY_ICON,
    badge: NOTIFY_ICON,
  };
  try {
    if (typeof opts.registration?.showNotification === "function") {
      await opts.registration.showNotification(payload.title, options);
      return true;
    }
  } catch {
    // constructor fallback
  }
  try {
    if (opts.Notification) {
      new opts.Notification(payload.title, options);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
