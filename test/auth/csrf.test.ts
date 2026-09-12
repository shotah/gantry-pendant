import { describe, expect, it } from "vitest";
import { csrfDenied, csrfOk } from "@/lib/auth/csrf";
import { SESSION_COOKIE } from "@/lib/auth/session";

function req(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

describe("csrf", () => {
  it("lets GET, non-API POSTs, and cookie-less Cab POSTs through", () => {
    expect(csrfOk(req("https://pendant.example/api/auth/me"))).toBe(true);
    expect(csrfOk(req("https://pendant.example/", { method: "POST" }))).toBe(true);
    expect(csrfOk(req("https://pendant.example/api/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }))).toBe(true);
  });

  it("requires same-origin (or matching Origin) when a session cookie rides a mutating /api call", () => {
    const cookie = `${SESSION_COOKIE}=jwe`;
    expect(csrfOk(req("https://pendant.example/api/auth/logout", {
      method: "POST",
      headers: { Cookie: cookie, "Sec-Fetch-Site": "same-origin" },
    }))).toBe(true);
    expect(csrfOk(req("https://pendant.example/api/avatar?slug=kit", {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://pendant.example" },
    }))).toBe(true);
    expect(csrfOk(req("https://pendant.example/api/auth/logout", {
      method: "POST",
      headers: { Cookie: cookie, "Sec-Fetch-Site": "none" },
    }))).toBe(true);
    expect(csrfOk(req("https://pendant.example/api/auth/logout", {
      method: "POST",
      headers: { Cookie: cookie, "Sec-Fetch-Site": "cross-site" },
    }))).toBe(false);
    expect(csrfOk(req("https://pendant.example/api/push", {
      method: "PUT",
      headers: { Cookie: cookie, Origin: "https://evil.example" },
    }))).toBe(false);
    expect(csrfOk(req("https://pendant.example/api/auth/logout", {
      method: "POST",
      headers: { Cookie: cookie },
    }))).toBe(false);
  });

  it("denies with the same unauthorized 403 as other doors", async () => {
    const res = csrfDenied();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });
});
