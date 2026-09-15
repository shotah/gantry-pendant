import { describe, expect, it } from "vitest";
import type { DirectoryKv } from "@/lib/auth/directory";
import { onSomeCrane, type DoorEnv } from "@/lib/auth/door";
import type { RoomUser } from "@/lib/mailbox/allow";

const ADA = "118212345678901234567";
const STRANGER = "999912345678901234567";

function memoryKv(init?: Record<string, string>): DirectoryKv {
  const store = new Map(Object.entries(init ?? {}));
  return {
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => {
      store.set(key, value);
    },
    delete: async (key) => {
      store.delete(key);
    },
  };
}

/** One fake Durable Object per slug; each answers `X-Pendant-Op: allow` with its room list. */
function mailbox(rooms: Record<string, RoomUser[]>, asked: string[] = []): DurableObjectNamespace {
  return {
    idFromName: (slug: string) => slug as unknown as DurableObjectId,
    get: (id: DurableObjectId) => ({
      fetch: async () => {
        const slug = id as unknown as string;
        asked.push(slug);
        return Response.json({ users: rooms[slug] ?? [] });
      },
    }),
  } as unknown as DurableObjectNamespace;
}

describe("onSomeCrane", () => {
  it("refuses a verified Google account that no crane lists", async () => {
    const env: DoorEnv = {
      DIRECTORY: memoryKv(),
      CRANE_BEARERS: "kit:tok,ada:tok2",
      MAILBOX: mailbox({ kit: [{ sub: ADA }] }),
    };
    expect(await onSomeCrane(env, { sub: STRANGER, email: "who@gmail.com", emailVerified: true })).toBe(false);
  });

  it("admits from the KV directory without touching a room", async () => {
    const asked: string[] = [];
    const env: DoorEnv = {
      DIRECTORY: memoryKv({ [`email:ada@example.com`]: JSON.stringify(["kit"]) }),
      CRANE_BEARERS: "kit:tok",
      MAILBOX: mailbox({}, asked),
    };
    expect(await onSomeCrane(env, { sub: ADA, email: "Ada@Example.com", emailVerified: true })).toBe(true);
    expect(asked).toEqual([]);
  });

  it("falls through to each bearer slug's room when KV has nothing", async () => {
    const asked: string[] = [];
    const env: DoorEnv = {
      DIRECTORY: memoryKv(),
      CRANE_BEARERS: "kit:tok,ada:tok2",
      MAILBOX: mailbox({ ada: [{ email: "ada@example.com" }] }, asked),
    };
    expect(await onSomeCrane(env, { sub: ADA, email: "ada@example.com", emailVerified: true })).toBe(true);
    expect(asked.sort()).toEqual(["ada", "kit"]);
  });

  it("works with no KV binding at all", async () => {
    const env: DoorEnv = {
      CRANE_BEARERS: "kit:tok",
      MAILBOX: mailbox({ kit: [{ sub: ADA }] }),
    };
    expect(await onSomeCrane(env, { sub: ADA, emailVerified: false })).toBe(true);
    expect(await onSomeCrane(env, { sub: STRANGER, emailVerified: false })).toBe(false);
  });

  it("does not match an email Google has not verified — in KV or in a room", async () => {
    const env: DoorEnv = {
      DIRECTORY: memoryKv({ [`email:ada@example.com`]: JSON.stringify(["kit"]) }),
      CRANE_BEARERS: "kit:tok",
      MAILBOX: mailbox({ kit: [{ email: "ada@example.com" }] }),
    };
    expect(await onSomeCrane(env, { sub: STRANGER, email: "ada@example.com", emailVerified: false })).toBe(false);
  });

  it("lets ALLOWED_SUBS in even when no crane has published a room yet", async () => {
    const env: DoorEnv = {
      DIRECTORY: memoryKv(),
      CRANE_BEARERS: "",
      ALLOWED_SUBS: `${ADA}:ada@example.com`,
    };
    expect(await onSomeCrane(env, { sub: ADA, emailVerified: true })).toBe(true);
    expect(await onSomeCrane(env, { sub: STRANGER, emailVerified: true })).toBe(false);
  });
});
