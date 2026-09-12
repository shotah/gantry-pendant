import { describe, expect, it } from "vitest";
import {
  CONTENT_SECURITY_POLICY,
  HSTS,
  PERMISSIONS_POLICY,
  withSecurityHeaders,
} from "@/lib/http/security";

describe("security headers", () => {
  it("stamps HTML with CSP, clickjacking, and permissions; HSTS only on https", () => {
    const https = withSecurityHeaders(
      new Request("https://pendant.example/"),
      new Response("<html></html>", { headers: { "Content-Type": "text/html" } }),
    );
    expect(https.headers.get("Content-Security-Policy")).toBe(CONTENT_SECURITY_POLICY);
    expect(https.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(https.headers.get("Content-Security-Policy")).toContain("connect-src 'self' ws: wss:");
    expect(https.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(https.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(https.headers.get("X-Frame-Options")).toBe("DENY");
    expect(https.headers.get("Permissions-Policy")).toBe(PERMISSIONS_POLICY);
    expect(https.headers.get("Strict-Transport-Security")).toBe(HSTS);
    expect(https.headers.get("Cache-Control")).toBeNull();

    const loopback = withSecurityHeaders(
      new Request("http://127.0.0.1:3000/"),
      new Response("ok"),
    );
    expect(loopback.headers.get("Strict-Transport-Security")).toBeNull();
    expect(loopback.headers.get("Content-Security-Policy")).toContain("ws:");
  });

  it("sets no-store on API routes and leaves a 101 upgrade alone", () => {
    const api = withSecurityHeaders(
      new Request("https://pendant.example/api/auth/me"),
      Response.json({ sub: "1182" }),
    );
    expect(api.headers.get("Cache-Control")).toBe("no-store");
    expect(api.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const upgrade = { status: 101 } as Response;
    expect(withSecurityHeaders(new Request("https://pendant.example/ws/kit"), upgrade)).toBe(upgrade);
  });
});
