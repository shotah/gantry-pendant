import { describe, expect, it } from "vitest";
import {
  clearCookie,
  mintSession,
  parseCookie,
  readSession,
  SESSION_COOKIE,
  sessionCookie,
  stateCookie,
} from "@/lib/auth/session";

describe("session", () => {
  const secret = "unit-session-secret";

  it("mints and reads an httpOnly-shaped cookie", async () => {
    const now = Date.UTC(2026, 8, 4);
    const token = await mintSession(secret, { sub: "1182", email: "ada@x.com" }, now);
    const claims = await readSession(secret, token, now + 1000);
    expect(claims).toMatchObject({ sub: "1182", email: "ada@x.com" });
    const cookie = sessionCookie(token, true);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain(SESSION_COOKIE);
    expect(parseCookie(cookie, SESSION_COOKIE)).toBe(token);
  });

  it("rejects junk, wrong secret, and expired idle", async () => {
    expect(await readSession(secret, "nope")).toBeNull();
    const token = await mintSession(secret, { sub: "1182" }, 0);
    expect(await readSession("other", token, 1000)).toBeNull();
    const fresh = await mintSession(secret, { sub: "1182" }, 1_000);
    const eightDays = 1_000 + 8 * 24 * 60 * 60 * 1000;
    expect(await readSession(secret, fresh, eightDays)).toBeNull();
  });

  it("parses and clears cookies", () => {
    expect(parseCookie(null, "x")).toBeUndefined();
    expect(parseCookie("a=1; pendant_session=hi%20x", SESSION_COOKIE)).toBe("hi x");
    expect(clearCookie(SESSION_COOKIE, false)).toContain("Max-Age=0");
    expect(stateCookie("abc", false)).toContain("pendant_oauth_state=abc");
  });
});
