import { createHash } from "node:crypto";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  acceptHuman,
  authorizeUrl,
  callbackUrl,
  decodeOAuthBind,
  encodeOAuthBind,
  exchangeCode,
  identityFromIdTokenPayload,
  newNonce,
  newPkce,
  newState,
} from "@/lib/auth/google";

describe("google oidc helpers", () => {
  it("builds a Web-client authorize URL with PKCE S256 and nonce", () => {
    const pkce = newPkce();
    const nonce = newNonce();
    const url = authorizeUrl({
      clientId: "web.apps.googleusercontent.com",
      origin: "https://gantry-pendant.example.workers.dev",
      state: "st",
      codeChallenge: pkce.challenge,
      nonce,
    });
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("accounts.google.com");
    expect(url).toContain("openid");
    expect(url).not.toContain("gmail");
    expect(url).not.toContain("code_verifier");
    expect(url).not.toContain(pkce.verifier);
    expect(parsed.searchParams.get("code_challenge")).toBe(pkce.challenge);
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("nonce")).toBe(nonce);
    expect(url).toContain(encodeURIComponent(
      "https://gantry-pendant.example.workers.dev/api/auth/callback/google",
    ));
    expect(callbackUrl("https://x.workers.dev/")).toBe("https://x.workers.dev/api/auth/callback/google");
    expect(newState().length).toBeGreaterThan(8);
    expect(newNonce().length).toBeGreaterThan(8);
  });

  it("mints an S256 challenge from the verifier", () => {
    const { verifier, challenge } = newPkce();
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("round-trips verifier and nonce in the state cookie payload", () => {
    const bind = { state: "st", verifier: "ver", nonce: "nce" };
    expect(decodeOAuthBind(encodeOAuthBind(bind))).toEqual(bind);
    expect(decodeOAuthBind(undefined)).toBeNull();
    expect(decodeOAuthBind("st")).toBeNull();
    expect(decodeOAuthBind("{}")).toBeNull();
    expect(decodeOAuthBind(JSON.stringify({ state: "st", verifier: "", nonce: "n" }))).toBeNull();
  });

  it("posts code_verifier on the token exchange", async () => {
    const ok = await exchangeCode({
      code: "c",
      clientId: "id",
      clientSecret: "sec",
      origin: "https://x.test",
      codeVerifier: "pkce-verifier",
      fetch: async (_url, init) => {
        expect(String(init?.body)).toContain("code_verifier=pkce-verifier");
        return Response.json({ id_token: "tok" });
      },
    });
    expect(ok).toEqual({ idToken: "tok" });
    const bad = await exchangeCode({
      code: "c",
      clientId: "id",
      clientSecret: "sec",
      origin: "https://x.test",
      codeVerifier: "pkce-verifier",
      fetch: async () => new Response("no", { status: 400 }),
    });
    expect(bad).toEqual({ error: "unauthorized" });
    const empty = await exchangeCode({
      code: "c",
      clientId: "id",
      clientSecret: "sec",
      origin: "https://x.test",
      codeVerifier: "pkce-verifier",
      fetch: async () => Response.json({}),
    });
    expect(empty).toEqual({ error: "unauthorized" });
  });

  it("requires the ID token nonce after signature verify", () => {
    expect(identityFromIdTokenPayload({ sub: "1182", nonce: "nce" }, "nce")).toEqual({
      sub: "1182",
      email: undefined,
      emailVerified: false,
    });
    expect(identityFromIdTokenPayload({ sub: "1182", email: "Ada@X.com", email_verified: true, nonce: "nce" }, "nce")).toEqual({
      sub: "1182",
      email: "ada@x.com",
      emailVerified: true,
    });
    expect(identityFromIdTokenPayload({ sub: "1182", nonce: "other" }, "nce")).toBeNull();
    expect(identityFromIdTokenPayload({ sub: "1182" }, "nce")).toBeNull();
    expect(identityFromIdTokenPayload({ nonce: "nce" }, "nce")).toBeNull();
    expect(identityFromIdTokenPayload({ sub: "1182", nonce: "nce" }, "")).toBeNull();
  });

  it("uses the same deny for unknown sub and missing identity", () => {
    const allowed = new Map([["1182", "ada@x.com"]]);
    expect(acceptHuman(null, allowed)).toBeNull();
    expect(acceptHuman({ sub: "nope", emailVerified: false }, allowed)).toBeNull();
    expect(acceptHuman({ sub: "1182", email: "ada@x.com", emailVerified: true }, allowed)).toEqual({
      sub: "1182",
      email: "ada@x.com",
      emailVerified: true,
    });
  });

  it("can mint a local JWT so verify tests stay offline", async () => {
    const key = new TextEncoder().encode("x".repeat(32));
    const token = await new SignJWT({ sub: "1182", email: "ada@x.com", nonce: "nce" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("https://accounts.google.com")
      .setAudience("client")
      .setExpirationTime("1h")
      .sign(key);
    expect(token.split(".")).toHaveLength(3);
  });
});
