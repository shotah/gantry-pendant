/** Browser and API response headers. Applied in the Worker after Vinext. */

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // THEME_BOOT / FONT_BOOT plus Vinext. Hashes wait on a nonce hook.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  // 'self' is https/http; the mailbox socket is ws/wss (loopback needs ws:).
  "connect-src 'self' ws: wss:",
  "font-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const PERMISSIONS_POLICY = "geolocation=(self), camera=(self), microphone=()";

export const HSTS = "max-age=31536000; includeSubDomains";

/** 101 Switching Protocols — wrapping the body would break the socket. */
export function isSwitchingProtocols(res: Response): boolean {
  return res.status === 101;
}

export function withSecurityHeaders(req: Request, res: Response): Response {
  if (isSwitchingProtocols(res)) {
    return res;
  }
  const url = new URL(req.url);
  const headers = new Headers(res.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", PERMISSIONS_POLICY);
  headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  if (url.protocol === "https:") {
    headers.set("Strict-Transport-Security", HSTS);
  }
  if (url.pathname.startsWith("/api/")) {
    headers.set("Cache-Control", "no-store");
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
