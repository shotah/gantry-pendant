import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/auth/callback/google/route";
import { AUTH_RETRY_LOCATION } from "@/lib/auth/bounce";
import { encodeOAuthBind } from "@/lib/auth/google";
import { AUTH_RATE_PER_MIN, resetAuthLimits } from "@/lib/auth/limit";
import { SESSION_COOKIE, STATE_COOKIE } from "@/lib/auth/session";

vi.mock("cloudflare:workers", () => ({
  env: {
    GOOGLE_CLIENT_ID: "web.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "shh",
    SESSION_SECRET: "0123456789abcdef0123456789abcdef",
  },
}));

const CALLBACK = "https://pendant.example/api/auth/callback/google";

function stateCookie(state: string): string {
  return `${STATE_COOKIE}=${encodeURIComponent(encodeOAuthBind({ state, verifier: "ver", nonce: "nce" }))}`;
}

beforeEach(() => {
  resetAuthLimits();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("google callback route", () => {
  it("bounces to the door when the state cookie is already gone (iOS twin delivery)", async () => {
    const res = await GET(new Request(`${CALLBACK}?code=c&state=st`));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(AUTH_RETRY_LOCATION);
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith(`${STATE_COOKIE}=;`) && c.includes("Max-Age=0"))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(false);
  });

  it("bounces without a session on a state mismatch", async () => {
    const exchange = vi.fn();
    vi.stubGlobal("fetch", exchange);
    const res = await GET(new Request(`${CALLBACK}?code=c&state=other`, {
      headers: { Cookie: stateCookie("st") },
    }));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(AUTH_RETRY_LOCATION);
    expect(exchange).not.toHaveBeenCalled();
    expect(res.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(false);
  });

  it("bounces when Google says the code was already spent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "invalid_grant" }, { status: 400 })));
    const res = await GET(new Request(`${CALLBACK}?code=c&state=st`, {
      headers: { Cookie: stateCookie("st") },
    }));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(AUTH_RETRY_LOCATION);
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith(`${STATE_COOKIE}=;`))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(false);
  });

  it("still rate-limits with a 429, not a bounce", async () => {
    let res: Response | undefined;
    for (let i = 0; i < AUTH_RATE_PER_MIN + 1; i++) {
      res = await GET(new Request(`${CALLBACK}?code=c&state=st`, {
        headers: { "CF-Connecting-IP": "203.0.113.9" },
      }));
    }
    expect(res?.status).toBe(429);
  });
});
