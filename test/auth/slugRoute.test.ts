import { describe, expect, it, vi } from "vitest";
import { authorizeSlug, fromStub, withSlug, type SlugRouteEnv } from "@/lib/auth/slugRoute";

function fakeMailbox(users: unknown[] = []) {
  const stub = {
    fetch: vi.fn(async (input: RequestInfo | URL) => {
      const req = input instanceof Request ? input : new Request(input);
      if (req.headers.get("X-Pendant-Op") === "allow") {
        return Response.json({ users });
      }
      return new Response("blob", { status: 200, headers: { "X-Pendant-Rev": "7" } });
    }),
  };
  const MAILBOX = {
    idFromName: (name: string) => name,
    get: () => stub,
  } as unknown as DurableObjectNamespace;
  return { stub, MAILBOX };
}

const SPIKE: SlugRouteEnv = { MAILBOX_SECRET: "shared" };

describe("withSlug", () => {
  it("refuses a bad slug before touching auth", async () => {
    const { MAILBOX } = fakeMailbox();
    const next = vi.fn();
    const res = await withSlug({ ...SPIKE, MAILBOX }, new Request("http://127.0.0.1/api/backdrop?slug=1bad"), next);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad slug" });
    expect(next).not.toHaveBeenCalled();
  });

  it("passes the spike secret through to the room stub", async () => {
    const { MAILBOX, stub } = fakeMailbox();
    const next = vi.fn(async (slug: string, s: DurableObjectStub) => {
      expect(slug).toBe("kit");
      expect(s).toBe(stub);
      return new Response("ok");
    });
    const res = await withSlug(
      { ...SPIKE, MAILBOX },
      new Request("http://127.0.0.1/api/backdrop?slug=kit&secret=shared"),
      next,
    );
    expect(res.status).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("denies a wrong spike secret with the shared 401 body", async () => {
    const { MAILBOX } = fakeMailbox();
    const next = vi.fn();
    const res = await withSlug({ ...SPIKE, MAILBOX }, new Request("http://127.0.0.1/api/backdrop?slug=kit&secret=nope"), next);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("lets the crane bearer in on the Authorization header only", async () => {
    const { MAILBOX } = fakeMailbox();
    const env: SlugRouteEnv = {
      MAILBOX,
      GOOGLE_CLIENT_ID: "g",
      SESSION_SECRET: "s".repeat(32),
      CRANE_BEARERS: "kit:crane-tok",
    };
    const next = vi.fn(async () => new Response("ok"));
    const header = await withSlug(env, new Request("https://pendant.example/api/backdrop?slug=kit", {
      headers: { Authorization: "Bearer crane-tok" },
    }), next);
    expect(header.status).toBe(200);
    const other = await withSlug(env, new Request("https://pendant.example/api/backdrop?slug=ada", {
      headers: { Authorization: "Bearer crane-tok" },
    }), next);
    expect(other.status).toBe(401);
    const query = await withSlug(env, new Request("https://pendant.example/api/backdrop?slug=kit&bearer=crane-tok"), next);
    expect(query.status).toBe(401);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("is a config error when the mailbox binding is missing", async () => {
    const next = vi.fn();
    const res = await withSlug({ MAILBOX_SECRET: "shared" }, new Request("http://127.0.0.1/api/backdrop?slug=kit&secret=shared"), next);
    expect(res.status).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("authorizeSlug", () => {
  it("skips auth on the loopback dev mouth only", async () => {
    const { MAILBOX } = fakeMailbox();
    const env: SlugRouteEnv = { MAILBOX, PENDANT_DEV: "1" };
    expect(await authorizeSlug(env, new Request("http://127.0.0.1:3000/api/backdrop?slug=kit"), "kit")).toBeNull();
    const remote = await authorizeSlug(env, new Request("https://pendant.example/api/backdrop?slug=kit"), "kit");
    expect(remote?.status).toBe(503);
  });
});

describe("fromStub", () => {
  it("copies status, headers, and body off the Durable Object response", async () => {
    const res = await fromStub(new Response("jpeg", { status: 200, headers: { "X-Pendant-Rev": "9", "Content-Type": "image/jpeg" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Pendant-Rev")).toBe("9");
    expect(await res.text()).toBe("jpeg");
    const empty = await fromStub(new Response(null, { status: 404 }));
    expect(empty.status).toBe(404);
    expect(empty.body).toBeNull();
  });
});
