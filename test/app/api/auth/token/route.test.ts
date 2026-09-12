import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getNonce } from "@/app/api/auth/nonce/route";
import { POST } from "@/app/api/auth/token/route";
import { resetAuthLimits } from "@/lib/auth/limit";
import { mintNativeSession } from "@/lib/auth/native";
import { resetNativeNonces } from "@/lib/auth/nonce";

vi.mock("cloudflare:workers", () => ({
  env: {
    GOOGLE_CLIENT_ID: "web.apps.googleusercontent.com",
    SESSION_SECRET: "sess",
    CRANE_BEARERS: "kit:tok",
  },
}));

vi.mock("@/lib/auth/native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/native")>();
  return {
    ...actual,
    mintNativeSession: vi.fn(async () => ({
      token: "jwe",
      sub: "1182",
      email: "ada@x.com",
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
});
