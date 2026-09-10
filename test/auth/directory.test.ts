import { describe, expect, it } from "vitest";
import {
  cranesFor,
  directoryApply,
  directoryDiff,
  directoryEmailKey,
  directoryIdle,
  directoryRemember,
  directorySubKey,
  parseSlugSet,
  admittedCranes,
  type DirectoryKv,
} from "@/lib/auth/directory";

function memoryKv(init?: Record<string, string>): DirectoryKv & { store: Map<string, string> } {
  const store = new Map(Object.entries(init ?? {}));
  return {
    store,
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => {
      store.set(key, value);
    },
    delete: async (key) => {
      store.delete(key);
    },
  };
}

describe("directory", () => {
  it("diffs added and removed subs and emails", () => {
    expect(directoryDiff(
      [{ sub: "118212345678901234567", email: "ada@example.com" }, { email: "bob@example.com" }],
      [{ sub: "118212345678901234567", email: "ada@example.com" }],
    )).toEqual({
      addSubs: [],
      dropSubs: [],
      addEmails: [],
      dropEmails: ["bob@example.com"],
    });
    expect(directoryDiff([], [{ email: "ada@example.com" }, { sub: "118212345678901234567" }])).toEqual({
      addSubs: ["118212345678901234567"],
      dropSubs: [],
      addEmails: ["ada@example.com"],
      dropEmails: [],
    });
  });

  it("writes this slug onto current keys and drops it from removed ones", async () => {
    const kv = memoryKv();
    await directoryApply(kv, "kit", [], [
      { sub: "118212345678901234567", email: "ada@example.com" },
      { email: "bob@example.com" },
    ]);
    expect(parseSlugSet(await kv.get(directorySubKey("118212345678901234567")))).toEqual(new Set(["kit"]));
    expect(parseSlugSet(await kv.get(directoryEmailKey("ada@example.com")))).toEqual(new Set(["kit"]));
    expect(parseSlugSet(await kv.get(directoryEmailKey("bob@example.com")))).toEqual(new Set(["kit"]));

    await directoryApply(kv, "kit", [
      { sub: "118212345678901234567", email: "ada@example.com" },
      { email: "bob@example.com" },
    ], [{ email: "ada@example.com" }]);
    expect(await kv.get(directorySubKey("118212345678901234567"))).toBeNull();
    expect(await kv.get(directoryEmailKey("bob@example.com"))).toBeNull();
    expect(parseSlugSet(await kv.get(directoryEmailKey("ada@example.com")))).toEqual(new Set(["kit"]));
  });

  it("unions sub and email slugs for /me", async () => {
    const kv = memoryKv({
      [directorySubKey("1182")]: JSON.stringify(["kit"]),
      [directoryEmailKey("ada@example.com")]: JSON.stringify(["ada", "kit"]),
    });
    expect(await cranesFor(kv, "1182", "ada@example.com")).toEqual(["ada", "kit"]);
    expect(await cranesFor(kv, "9999")).toEqual([]);
  });

  it("re-indexes a stored room onto KV on crane reconnect", async () => {
    const kv = memoryKv();
    expect(await directoryRemember(kv, "tim", [{ email: "ada@example.com" }])).toBe(true);
    expect(parseSlugSet(await kv.get(directoryEmailKey("ada@example.com")))).toEqual(new Set(["tim"]));
    expect(await directoryRemember(kv, "tim", [])).toBe(true);
    expect(parseSlugSet(await kv.get(directoryEmailKey("ada@example.com")))).toEqual(new Set(["tim"]));
  });

  it("swallows a KV write miss on remember", async () => {
    const kv: DirectoryKv = {
      get: async () => null,
      put: async () => {
        throw new Error("limit");
      },
      delete: async () => undefined,
    };
    await expect(directoryRemember(kv, "kit", [{ email: "ada@example.com" }])).resolves.toBe(false);
  });

  it("adds a typed slug only when the Durable Object room admits", async () => {
    const kv = memoryKv({
      [directorySubKey("1182")]: JSON.stringify(["kit"]),
    });
    const rooms = new Map([
      ["tim", [{ email: "ada@example.com" }]],
      ["ghost", []],
    ]);
    const session = { sub: "1182", email: "ada@example.com", emailVerified: true };
    expect(await admittedCranes({
      kv,
      slugs: ["tim", "ghost"],
      session,
      rooms: async (slug) => rooms.get(slug) ?? [],
    })).toEqual(["kit", "tim"]);
    expect(await admittedCranes({
      kv,
      slugs: ["ghost"],
      session,
      rooms: async (slug) => rooms.get(slug) ?? [],
    })).toEqual(["kit"]);
  });

  it("does not probe slugs that were not passed", async () => {
    const probed: string[] = [];
    const kv = memoryKv({
      [directorySubKey("1182")]: JSON.stringify(["kit"]),
    });
    expect(await admittedCranes({
      kv,
      slugs: [],
      session: { sub: "1182" },
      rooms: async (slug) => {
        probed.push(slug);
        return [];
      },
    })).toEqual(["kit"]);
    expect(probed).toEqual([]);
    expect(directoryIdle(
      [{ email: "ada@example.com" }],
      [{ email: "ada@example.com" }],
    )).toBe(true);
    expect(directoryIdle([], [{ email: "ada@example.com" }])).toBe(false);
  });
});
