/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { browserSubscribePush } from "@/app/lib/push";
import { encodeBase64Url, generateVapidKeys } from "@/lib/push/vapid";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browserSubscribePush", () => {
  it("skips when notifications are off or PushManager is missing", async () => {
    expect(await browserSubscribePush("kit")).toBe(false);
    class FakeNotification {
      static permission: NotificationPermission = "granted";
    }
    vi.stubGlobal("Notification", FakeNotification);
    expect(await browserSubscribePush("kit")).toBe(false);
  });

  it("subscribes after Google and PUTs the endpoint", async () => {
    const keys = await generateVapidKeys();
    const pub = new Uint8Array(65);
    pub[0] = 0x04;
    const auth = new Uint8Array(16);
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/ada",
      keys: { p256dh: encodeBase64Url(pub), auth: encodeBase64Url(auth) },
    };
    const subscribe = vi.fn(async () => ({ toJSON: () => subscription }));
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (!init?.method && url.includes("/api/push")) {
        return Response.json({ publicKey: keys.publicKey });
      }
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as { slug?: string };
        expect(body.slug).toBe("kit");
        return Response.json({ ok: true });
      }
      return new Response(null, { status: 404 });
    });
    class FakeNotification {
      static permission: NotificationPermission = "granted";
    }
    vi.stubGlobal("Notification", FakeNotification);
    vi.stubGlobal("PushManager", class PushManager {});
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: { getSubscription: async () => null, subscribe },
        }),
      },
    });
    expect(await browserSubscribePush("kit")).toBe(true);
    expect(subscribe).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reuses an existing subscription and fails closed on a dead vapid fetch", async () => {
    const keys = await generateVapidKeys();
    const toJSON = vi.fn(() => ({ endpoint: "https://fcm.googleapis.com/fcm/send/old" }));
    class FakeNotification {
      static permission: NotificationPermission = "granted";
    }
    vi.stubGlobal("Notification", FakeNotification);
    vi.stubGlobal("PushManager", class PushManager {});
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return Response.json({ ok: true });
      }
      return Response.json({ publicKey: keys.publicKey });
    }));
    const subscribe = vi.fn();
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: { getSubscription: async () => ({ toJSON }), subscribe },
        }),
      },
    });
    expect(await browserSubscribePush("kit")).toBe(true);
    expect(subscribe).not.toHaveBeenCalled();
    expect(await browserSubscribePush("")).toBe(false);
  });

  it("returns false when the Worker has no VAPID keys", async () => {
    class FakeNotification {
      static permission: NotificationPermission = "granted";
    }
    vi.stubGlobal("Notification", FakeNotification);
    vi.stubGlobal("PushManager", class PushManager {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    vi.stubGlobal("navigator", { serviceWorker: { ready: Promise.resolve({}) } });
    expect(await browserSubscribePush("kit")).toBe(false);
  });
});
