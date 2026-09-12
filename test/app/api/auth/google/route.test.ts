import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/auth/google/route";
import { decodeOAuthBind } from "@/lib/auth/google";
import { parseCookie, STATE_COOKIE } from "@/lib/auth/session";

vi.mock("cloudflare:workers", () => ({
  env: {
    GOOGLE_CLIENT_ID: "web.apps.googleusercontent.com",
    SESSION_SECRET: "0123456789abcdef0123456789abcdef",
    CRANE_BEARERS: "kit:tok",
  },
}));

const START = "https://pendant.example/api/auth/google";

function stateFrom(res: Response): string | undefined {
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith(`${STATE_COOKIE}=`));
  return parseCookie(cookie ?? null, STATE_COOKIE);
}

describe("google start route", () => {
  it("stores a sanitized next in the state cookie", () => {
    const res = GET(new Request(`${START}?next=${encodeURIComponent("/?slug=Kit")}`));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location") ?? "").toContain("accounts.google.com");
    expect(decodeOAuthBind(stateFrom(res))).toMatchObject({ next: "/?slug=kit" });
  });

  it("drops an open-redirect next", () => {
    const res = GET(new Request(`${START}?next=${encodeURIComponent("https://evil.example/")}`));
    expect(decodeOAuthBind(stateFrom(res))?.next).toBeUndefined();
  });
});
