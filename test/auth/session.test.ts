import { describe, expect, it } from "vitest";
import {
  bearerToken,
  clearCookie,
  mintSession,
  parseCookie,
  readSession,
  readSessionFromRequest,
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
    expect(claims).toMatchObject({ sub: "1182", email: "ada@x.com", emailVerified: false });
    const cookie = sessionCookie(token, true);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain(SESSION_COOKIE);
    expect(parseCookie(cookie, SESSION_COOKIE)).toBe(token);
  });

  it("stores email_verified on the claims", async () => {
    const now = Date.UTC(2026, 8, 4);
    const token = await mintSession(secret, {
      sub: "1182",
      email: "Ada@X.com",
      emailVerified: true,
    }, now);
    expect(await readSession(secret, token, now + 1000)).toMatchObject({
      sub: "1182",
      email: "ada@x.com",
      emailVerified: true,
    });
  });

  it("rejects junk, wrong secret, and a hard 7d exp (8 days is gone; 6 days still reads)", async () => {
    expect(await readSession(secret, "nope")).toBeNull();
    const token = await mintSession(secret, { sub: "1182" }, 0);
    expect(await readSession("other", token, 1000)).toBeNull();
    const mintedAt = Math.floor(Date.now() / 1000) * 1000;
    const fresh = await mintSession(secret, { sub: "1182" }, mintedAt);
    const claims = await readSession(secret, fresh, mintedAt);
    expect(claims?.exp).toBe(mintedAt + 7 * 24 * 60 * 60 * 1000);
    const sixDays = mintedAt + 6 * 24 * 60 * 60 * 1000;
    expect(await readSession(secret, fresh, sixDays)).not.toBeNull();
    const eightDays = mintedAt + 8 * 24 * 60 * 60 * 1000;
    expect(await readSession(secret, fresh, eightDays)).toBeNull();
  });

  it("parses and clears cookies", () => {
    expect(parseCookie(null, "x")).toBeUndefined();
    expect(parseCookie("a=1; pendant_session=hi%20x", SESSION_COOKIE)).toBe("hi x");
    expect(clearCookie(SESSION_COOKIE, false)).toContain("Max-Age=0");
    expect(stateCookie("abc", false)).toContain("pendant_oauth_state=abc");
  });

  it("reads the same JWE from cookie or Authorization (cookie wins)", async () => {
    const now = Date.UTC(2026, 8, 4);
    const token = await mintSession(secret, { sub: "1182", email: "ada@x.com" }, now);
    const other = await mintSession(secret, { sub: "999" }, now);
    expect(bearerToken(undefined)).toBeUndefined();
    expect(bearerToken("Basic x")).toBeUndefined();
    expect(bearerToken("Bearer")).toBeUndefined();
    expect(bearerToken(`Bearer ${token}`)).toBe(token);
    expect(await readSessionFromRequest(secret, { authorization: `Bearer ${token}` }, now + 1000)).toMatchObject({
      sub: "1182",
      email: "ada@x.com",
    });
    const cookieWins = await readSessionFromRequest(secret, {
      cookieHeader: `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
      authorization: `Bearer ${other}`,
    }, now + 1000);
    expect(cookieWins?.sub).toBe("1182");
    expect(await readSessionFromRequest(secret, { cookieHeader: "x=1" }, now)).toBeNull();
  });
});
