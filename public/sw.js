// Do not cache chat or API — the socket is the source of truth.
// Navigation fetch + offline fallback is a real handler (not a no-op), which
// Chromium still uses as a signal for beforeinstallprompt on some builds.
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => new Response(
      "<!doctype html><meta charset=utf-8><title>pendant</title><p>offline</p>",
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
    )),
  );
});

// Web Push (VAPID) when the phone socket is gone. Local toasts still come
// from the page while the thread is open.
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let title = "pendant";
    let body = "New message";
    let tag = "pendant";
    try {
      const parsed = event.data ? event.data.json() : null;
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.title === "string" && parsed.title.trim()) {
          title = parsed.title;
        }
        if (typeof parsed.body === "string" && parsed.body.trim()) {
          body = parsed.body;
        }
        if (typeof parsed.tag === "string" && parsed.tag) {
          tag = parsed.tag;
        }
      }
    } catch {
      // unencrypted / empty payload
    }
    await self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag,
    });
  })());
});

// Local toasts from the page, or a lock-screen ping. Tap focuses the open client.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        return;
      }
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow("/");
    }
  })());
});
