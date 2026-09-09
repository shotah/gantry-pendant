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
