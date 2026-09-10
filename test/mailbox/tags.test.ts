import { describe, expect, it } from "vitest";
import {
  collectTagged,
  isSocketOpen,
  parseSocketTags,
  queueForCrane,
  roleTag,
  socketTags,
  subTag,
  tagAliases,
} from "@/lib/mailbox/tags";

describe("socket tags", () => {
  it("prefixes every slot so user_id cannot match role or verified", () => {
    expect(socketTags({
      role: "phone",
      rateId: "sub:1182",
      userId: "1",
      expMs: 9,
      email: "ada@example.com",
      emailVerified: true,
    })).toEqual([
      "role:phone",
      "rate:sub:1182",
      "sub:1",
      "exp:9",
      "email:ada@example.com",
      "verified:1",
    ]);
    expect(parseSocketTags(socketTags({
      role: "phone",
      rateId: "anon",
      userId: "1",
      emailVerified: true,
    }))).toEqual({
      role: "phone",
      rateId: "anon",
      userId: "1",
      expMs: undefined,
      email: undefined,
      emailVerified: true,
    });
  });

  it("still reads leftover positional tags from before the prefix", () => {
    expect(parseSocketTags(["phone", "anon", "1182", "9", "ada@example.com", "1"])).toEqual({
      role: "phone",
      rateId: "anon",
      userId: "1182",
      expMs: 9,
      email: "ada@example.com",
      emailVerified: true,
    });
  });

  it("looks up both prefixed and leftover names", () => {
    expect(tagAliases(roleTag("phone"))).toEqual(["role:phone", "phone"]);
    expect(tagAliases(subTag("ada"))).toEqual(["sub:ada", "ada"]);
    const sockets = {
      "role:phone": [{ readyState: 1 }],
      phone: [{ readyState: 1 }, { readyState: 0 }],
    };
    expect(collectTagged((tag) => sockets[tag as keyof typeof sockets] ?? [], roleTag("phone"))).toHaveLength(3);
    expect(isSocketOpen({ readyState: 1 })).toBe(true);
    expect(isSocketOpen({ readyState: 0 })).toBe(false);
    expect(queueForCrane(0)).toBe(true);
    expect(queueForCrane(1)).toBe(false);
  });
});
