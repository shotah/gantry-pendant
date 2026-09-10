"use client";

import { useEffect, useState } from "react";
import { isIos, isStandalone } from "@/app/lib/install";
import { browserAskNotify, browserShowNotify, notifyPermission } from "@/app/lib/notify";
import {
  NOTIFY_TEST,
  notifyHint,
  notifyNeedHomeScreen,
  type NotifyPermission,
} from "@/lib/phone/notify";

export function NotifyEnable({
  onGranted,
}: {
  onGranted?: () => void | boolean | Promise<void | boolean>;
}) {
  const [permission, setPermission] = useState<NotifyPermission>("unsupported");
  const [needHome, setNeedHome] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    function sync() {
      setPermission(notifyPermission());
      setNeedHome(notifyNeedHomeScreen(isIos(navigator), isStandalone(window, navigator)));
    }
    sync();
    const perms = navigator.permissions;
    if (!perms || typeof perms.query !== "function") {
      return;
    }
    let statusHandle: PermissionStatus | undefined;
    let dead = false;
    void perms.query({ name: "notifications" })
      .then((next) => {
        if (dead) {
          return;
        }
        statusHandle = next;
        next.onchange = () => {
          sync();
        };
      })
      .catch(() => undefined);
    return () => {
      dead = true;
      if (statusHandle) {
        statusHandle.onchange = null;
      }
    };
  }, []);

  const granted = permission === "granted";
  const blocked = needHome || permission === "unsupported";
  const hint = status || notifyHint({ permission, needHomeScreen: needHome });

  async function enable() {
    setStatus("");
    const next = await browserAskNotify();
    setPermission(next);
    if (next !== "granted") {
      return;
    }
    const subscribed = onGranted ? (await onGranted()) !== false : true;
    const ok = await browserShowNotify(NOTIFY_TEST);
    if (!subscribed) {
      setStatus("Granted, but lock-screen push did not register.");
      return;
    }
    setStatus(ok ? "Sent a test ping." : "Granted, but the toast did not appear.");
  }

  async function test() {
    const ok = await browserShowNotify(NOTIFY_TEST);
    setStatus(ok ? "Sent a test ping." : "The toast did not appear.");
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">Notifications</span>
      {granted
        ? (
            <button
              type="button"
              className="rounded-xl border border-accent-line bg-accent-soft px-4 py-2 text-sm text-mark"
              onClick={() => void test()}
            >
              Send test ping
            </button>
          )
        : (
            <button
              type="button"
              className="rounded-xl border border-accent-line bg-accent-soft px-4 py-2 text-sm text-mark disabled:opacity-50"
              disabled={blocked}
              onClick={() => void enable()}
            >
              Enable notifications
            </button>
          )}
      {hint
        ? <p className="text-xs text-dim">{hint}</p>
        : null}
    </div>
  );
}
