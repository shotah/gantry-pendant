import { describe, expect, it } from "vitest";
import {
  cranesFor,
  directoryApply,
  directoryDiff,
  directoryEmailKey,
  directorySubKey,
  parseSlugSet,
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
});
