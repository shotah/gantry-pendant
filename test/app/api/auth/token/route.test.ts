import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getNonce } from "@/app/api/auth/nonce/route";
import { POST } from "@/app/api/auth/token/route";
import { resetAuthLimits } from "@/lib/auth/limit";
import { mintNativeSession } from "@/lib/auth/native";
import { resetNativeNonces } from "@/lib/auth/nonce";

vi.mock("cloudflare:workers", () => {
  // DIRECTORY carries both the crane index (Kit listed Ada by sub) and native nonce rows.
  const store = new Map<string, string>([["sub:1182", JSON.stringify(["kit"])]]);
  return {
    env: {
      GOOGLE_CLIENT_ID: "web.apps.googleusercontent.com",
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

vi.mock("@/lib/auth/native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/native")>();
  return {
    ...actual,
    mintNativeSession: vi.fn(async () => ({
      token: "jwe",
      sub: "1182",
      email: "ada@x.com",
      emailVerified: true,
      exp: 1,
    })),
  };
});

afterEach(() => {
  resetAuthLimits();
  resetNativeNonces();
  vi.mocked(mintNativeSession).mockClear();
});

function tokenReq(nonce: string): Request {
  return new Request("https://pendant.example/api/auth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id_token: "id-token", nonce }),
  });
}

describe("native token route", () => {
  it("mints when the nonce row is missing (old Cab local mint)", async () => {
    const res = await POST(tokenReq("local-mint"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ token: "jwe", sub: "1182" });
    expect(mintNativeSession).toHaveBeenCalledTimes(1);
  });

  it("consumes a server nonce once", async () => {
    const issued = await getNonce(new Request("https://pendant.example/api/auth/nonce"));
    const body = await issued.json() as { nonce: string };
    expect((await POST(tokenReq(body.nonce))).status).toBe(200);
    expect(mintNativeSession).toHaveBeenCalledTimes(1);
    expect((await POST(tokenReq(body.nonce))).status).toBe(401);
    expect(mintNativeSession).toHaveBeenCalledTimes(1);
  });

  it("refuses a Google account no crane lists with a 403 and no JWE", async () => {
    vi.mocked(mintNativeSession).mockResolvedValueOnce({
      token: "jwe",
      sub: "9999",
      email: "who@gmail.com",
      emailVerified: true,
      exp: 1,
    });
    const res = await POST(tokenReq("local-mint"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("does not answer with the JWE body shape on a deny", async () => {
    vi.mocked(mintNativeSession).mockResolvedValueOnce({
      token: "jwe",
      sub: "9999",
      emailVerified: false,
      exp: 1,
    });
    const body = await (await POST(tokenReq("local-mint"))).json() as Record<string, unknown>;
    expect(body).not.toHaveProperty("token");
  });
});
