"use client";

import { useEffect, useState } from "react";
import { PermitRow } from "./PermitRow";
import { isIos, isStandalone } from "@/app/lib/install";
import { browserAskNotify, browserShowNotify, notifyPermission } from "@/app/lib/notify";
import {
  NOTIFY_TEST,
  notifyAskState,
  notifyHint,
  notifyNeedHomeScreen,
  type NotifyPermission,
} from "@/lib/phone/notify";

export function NotifyEnable({
  onGranted,
}: {
  onGranted?: () => void | boolean | Promise<void | boolean>;
}) {
  const [permission, setPermission] = useState<NotifyPermission>("default");
  const [asked, setAsked] = useState(false);
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

  const view = notifyAskState(permission, asked);
  const granted = view === "granted";
  const blocked = needHome || view === "unsupported";
  const hint = status || notifyHint({ permission: view, needHomeScreen: needHome });

  async function enable() {
    setStatus("");
    setAsked(true);
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

  if (granted) {
    return (
      <PermitRow
        name="Notifications"
        action="Test"
        hint={hint}
        onClick={() => void test()}
      />
    );
  }
  return (
    <PermitRow
      name="Notifications"
      action="Enable notifications"
      hint={hint}
      disabled={blocked}
      onClick={() => void enable()}
    />
  );
}
