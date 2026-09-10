import { describe, expect, it } from "vitest";
import { mintNativeSession, parseNativeTokenBody } from "@/lib/auth/native";

describe("native cab token", () => {
  it("requires id_token and nonce", () => {
    expect(parseNativeTokenBody(null)).toBeNull();
    expect(parseNativeTokenBody([])).toBeNull();
    expect(parseNativeTokenBody({})).toBeNull();
    expect(parseNativeTokenBody({ id_token: "tok" })).toBeNull();
    expect(parseNativeTokenBody({ nonce: "nce" })).toBeNull();
    expect(parseNativeTokenBody({ id_token: "", nonce: "nce" })).toBeNull();
    expect(parseNativeTokenBody({ id_token: "tok", nonce: "" })).toBeNull();
    expect(parseNativeTokenBody({ id_token: "tok", nonce: "nce" })).toEqual({
      idToken: "tok",
      nonce: "nce",
    });
  });

  it("mints the same session JWE the PWA cookie would hold", async () => {
    const now = Date.UTC(2026, 8, 4);
    const session = await mintNativeSession({
      idToken: "id-token",
      nonce: "nce",
      clientId: "web.apps.googleusercontent.com",
      sessionSecret: "sess-secret",
      now,
      verify: async (token, clientId, nonce) => {
        expect(token).toBe("id-token");
        expect(clientId).toBe("web.apps.googleusercontent.com");
        expect(nonce).toBe("nce");
        return { sub: "1182", email: "Ada@X.com", emailVerified: true };
      },
    });
    expect(session).toMatchObject({
      sub: "1182",
      email: "ada@x.com",
      exp: now + 7 * 24 * 60 * 60 * 1000,
    });
    expect(session?.token.length).toBeGreaterThan(20);
  });

  it("returns null for a bad ID token or missing Worker secrets", async () => {
    const now = Date.UTC(2026, 8, 4);
    expect(await mintNativeSession({
      idToken: "id-token",
      nonce: "nce",
      clientId: "web",
      sessionSecret: "sess",
      now,
      verify: async () => null,
    })).toBeNull();
    expect(await mintNativeSession({
      idToken: "id-token",
      nonce: "nce",
      clientId: "  ",
      sessionSecret: "sess",
      now,
      verify: async () => ({ sub: "1182", emailVerified: true }),
    })).toBeNull();
  });
});
