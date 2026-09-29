import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/auth/me/route";
import { resetAuthLimits } from "@/lib/auth/limit";
import { mintSession, SESSION_COOKIE } from "@/lib/auth/session";

vi.mock("cloudflare:workers", () => {
  const store = new Map<string, string>([
    ["sub:1182", JSON.stringify(["kit"])],
    ["email:ada@example.com", JSON.stringify(["hidden"])],
  ]);
  return {
    env: {
      SESSION_SECRET: "sess",
      CRANE_BEARERS: "kit:tok",
      DIRECTORY: {
        get: async (key: string) => store.get(key) ?? null,
        put: async (key: string, value: string) => {
          store.set(key, value);
        },
        delete: async (key: string) => {
          store.delete(key);
        },
      },
    },
  };
});

afterEach(() => {
  resetAuthLimits();
});

async function cookie(emailVerified: boolean): Promise<string> {
  const jwe = await mintSession("sess", {
    sub: "1182",
    email: "ada@example.com",
    emailVerified,
  });
  return `${SESSION_COOKIE}=${encodeURIComponent(jwe)}`;
}

function meReq(cookieHeader?: string): Request {
  const headers = cookieHeader ? { Cookie: cookieHeader } : undefined;
  return new Request("https://pendant.example/api/auth/me", { headers });
}

describe("GET /api/auth/me", () => {
  it("does not look up crane slugs by an unverified email", async () => {
    const res = await GET(meReq(await cookie(false)));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sub: "1182", cranes: ["kit"] });
  });

  it("includes cranes listed by a verified email", async () => {
    const res = await GET(meReq(await cookie(true)));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ cranes: ["hidden", "kit"] });
  });
});
