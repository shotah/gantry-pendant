import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/auth/callback/google/route";
import { AUTH_DENIED_LOCATION, AUTH_RETRY_LOCATION } from "@/lib/auth/bounce";
import { encodeOAuthBind, verifyIdToken } from "@/lib/auth/google";
import { AUTH_RATE_PER_MIN, resetAuthLimits } from "@/lib/auth/limit";
import { SESSION_COOKIE, STATE_COOKIE } from "@/lib/auth/session";

const ADA = "118212345678901234567";
const STRANGER = "999912345678901234567";

vi.mock("cloudflare:workers", () => ({
  env: {
    GOOGLE_CLIENT_ID: "web.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "shh",
    SESSION_SECRET: "0123456789abcdef0123456789abcdef",
    CRANE_BEARERS: "kit:tok",
    // Kit's crane listed Ada; the directory index is what the door reads first.
    DIRECTORY: {
      get: async (key: string) => (key === "email:ada@example.com" ? JSON.stringify(["kit"]) : null),
      put: async () => undefined,
      delete: async () => undefined,
    },
  },
}));

vi.mock("@/lib/auth/google", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/google")>();
  return { ...actual, verifyIdToken: vi.fn(async () => null) };
});

const CALLBACK = "https://pendant.example/api/auth/callback/google";

function stateCookie(state: string): string {
  return `${STATE_COOKIE}=${encodeURIComponent(encodeOAuthBind({ state, verifier: "ver", nonce: "nce" }))}`;
}

/** Google's token endpoint hands back an ID token; `verifyIdToken` decides who it is. */
function googleSaysItIs(identity: { sub: string; email?: string; emailVerified: boolean }): void {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id_token: "id" })));
  vi.mocked(verifyIdToken).mockResolvedValueOnce(identity);
}

beforeEach(() => {
  resetAuthLimits();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(verifyIdToken).mockReset();
});

describe("google callback route", () => {
  it("mints a session for a Google account some crane lists", async () => {
    googleSaysItIs({ sub: ADA, email: "ada@example.com", emailVerified: true });
    const res = await GET(new Request(`${CALLBACK}?code=c&state=st`, {
      headers: { Cookie: stateCookie("st") },
    }));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
    expect(res.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=`) && !c.includes("Max-Age=0"))).toBe(true);
  });

  it("refuses a Google account no crane lists — no session, bounced with the denied flag", async () => {
    googleSaysItIs({ sub: STRANGER, email: "who@gmail.com", emailVerified: true });
    const res = await GET(new Request(`${CALLBACK}?code=c&state=st`, {
      headers: { Cookie: stateCookie("st") },
    }));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(AUTH_DENIED_LOCATION);
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith(`${STATE_COOKIE}=;`) && c.includes("Max-Age=0"))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(false);
  });

  it("does not let an unverified email borrow a listed address", async () => {
    googleSaysItIs({ sub: STRANGER, email: "ada@example.com", emailVerified: false });
    const res = await GET(new Request(`${CALLBACK}?code=c&state=st`, {
      headers: { Cookie: stateCookie("st") },
    }));
    expect(res.headers.get("Location")).toBe(AUTH_DENIED_LOCATION);
    expect(res.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(false);
  });

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
