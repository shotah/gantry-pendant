import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  acceptHuman,
  authorizeUrl,
  callbackUrl,
  exchangeCode,
  newState,
} from "@/lib/auth/google";

describe("google oidc helpers", () => {
  it("builds a Web-client authorize URL on this origin", () => {
    const url = authorizeUrl({
      clientId: "web.apps.googleusercontent.com",
      origin: "https://gantry-pendant.example.workers.dev",
      state: "st",
    });
    expect(url).toContain("accounts.google.com");
    expect(url).toContain("openid");
    expect(url).not.toContain("gmail");
    expect(url).toContain(encodeURIComponent(
      "https://gantry-pendant.example.workers.dev/api/auth/callback/google",
    ));
    expect(callbackUrl("https://x.workers.dev/")).toBe("https://x.workers.dev/api/auth/callback/google");
    expect(newState().length).toBeGreaterThan(8);
  });

  it("exchanges a code and treats token failures as unauthorized", async () => {
    const ok = await exchangeCode({
      code: "c",
      clientId: "id",
      clientSecret: "sec",
      origin: "https://x.test",
      fetch: async () => Response.json({ id_token: "tok" }),
    });
    expect(ok).toEqual({ idToken: "tok" });
    const bad = await exchangeCode({
      code: "c",
      clientId: "id",
      clientSecret: "sec",
      origin: "https://x.test",
      fetch: async () => new Response("no", { status: 400 }),
    });
    expect(bad).toEqual({ error: "unauthorized" });
    const empty = await exchangeCode({
      code: "c",
      clientId: "id",
      clientSecret: "sec",
      origin: "https://x.test",
      fetch: async () => Response.json({}),
    });
    expect(empty).toEqual({ error: "unauthorized" });
  });

  it("uses the same deny for unknown sub and missing identity", () => {
    const allowed = new Map([["1182", "ada@x.com"]]);
    expect(acceptHuman(null, allowed)).toBeNull();
    expect(acceptHuman({ sub: "nope" }, allowed)).toBeNull();
    expect(acceptHuman({ sub: "1182", email: "ada@x.com" }, allowed)).toEqual({
      sub: "1182",
      email: "ada@x.com",
    });
  });

  it("can mint a local JWT so verify tests stay offline", async () => {
    const key = new TextEncoder().encode("x".repeat(32));
    const token = await new SignJWT({ sub: "1182", email: "ada@x.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("https://accounts.google.com")
      .setAudience("client")
      .setExpirationTime("1h")
      .sign(key);
    expect(token.split(".")).toHaveLength(3);
  });
});
