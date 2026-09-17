import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/push/route";
import { resetAuthLimits } from "@/lib/auth/limit";
import { mintSession, SESSION_COOKIE } from "@/lib/auth/session";
import { generateVapidKeys } from "@/lib/push/vapid";

type MockEnv = Record<string, string | undefined> & { MAILBOX?: unknown };

const mockEnv = vi.hoisted<MockEnv>(() => ({}));

vi.mock("cloudflare:workers", () => ({ env: mockEnv }));

const roomFetch = vi.fn<(req: Request) => Promise<Response>>();

async function cookie(): Promise<string> {
  const jwe = await mintSession("sess", { sub: "1182", email: "ada@x.com", emailVerified: true });
  return `${SESSION_COOKIE}=${jwe}`;
}

function pushReq(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://pendant.example/api/push", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

beforeEach(async () => {
  const keys = await generateVapidKeys();
  mockEnv.SESSION_SECRET = "sess";
  mockEnv.GOOGLE_CLIENT_ID = "cid";
  mockEnv.GOOGLE_CLIENT_SECRET = "csecret";
  mockEnv.CRANE_BEARERS = "kit:bearer-token";
  mockEnv.ALLOWED_SUBS = "1182";
  mockEnv.VAPID_PUBLIC_KEY = keys.publicKey;
  mockEnv.VAPID_PRIVATE_KEY = JSON.stringify(keys.privateJwk);
  mockEnv.VAPID_SUBJECT = "mailto:ada@example.com";
  roomFetch.mockReset();
  roomFetch.mockImplementation(async (req) => {
    if (req.headers.get("X-Pendant-Op") === "allow") {
      return Response.json([]);
    }
    return Response.json({ rows: 1, ok: 1, gone: 0, fail: 0, statuses: [] });
  });
  mockEnv.MAILBOX = {
    idFromName: () => "room-id",
    get: () => ({ fetch: roomFetch }),
  };
});

afterEach(() => {
  resetAuthLimits();
});

describe("POST /api/push (round-trip test)", () => {
  it("is 404 without VAPID keys and never wakes the room", async () => {
    mockEnv.VAPID_PRIVATE_KEY = undefined;
    const res = await POST(pushReq(JSON.stringify({ slug: "kit" }), { Cookie: await cookie() }));
    expect(res.status).toBe(404);
    expect(roomFetch).not.toHaveBeenCalled();
  });

  it("refuses a body without a slug before touching auth", async () => {
    const res = await POST(pushReq(JSON.stringify({ nope: 1 }), { Cookie: await cookie() }));
    expect(res.status).toBe(400);
    expect(roomFetch).not.toHaveBeenCalled();
  });

  it("is 401 without a session", async () => {
    const res = await POST(pushReq(JSON.stringify({ slug: "kit" })));
    expect(res.status).toBe(401);
  });

  it("hands the room a POST push op stamped with the caller's sub and returns its counts", async () => {
    const res = await POST(pushReq(JSON.stringify({ slug: "kit" }), { Cookie: await cookie() }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rows: 1, ok: 1, gone: 0, fail: 0, statuses: [] });
    const forwarded = roomFetch.mock.calls.map(([req]) => req).find((req) => req.headers.get("X-Pendant-Op") === "push");
    expect(forwarded?.method).toBe("POST");
    expect(forwarded?.headers.get("X-Pendant-Sub")).toBe("1182");
    expect(await forwarded?.json()).toEqual({ slug: "kit" });
  });
});
