import { describe, expect, it } from "vitest";
import { shouldWebPush, webPushUserIds } from "@/lib/push/target";

describe("push target", () => {
  it("only wakes lock-screen for crane push and reply", () => {
    expect(shouldWebPush("push")).toBe(true);
    expect(shouldWebPush("reply")).toBe(true);
    expect(shouldWebPush("inbound")).toBe(false);
    expect(shouldWebPush("error")).toBe(false);
    expect(shouldWebPush("cmds")).toBe(false);
  });

  it("skips a live phone and broadcasts to everyone else", () => {
    const live = new Set(["ada"]);
    expect(webPushUserIds({ frameUserId: "ada", live, storedUserIds: ["ada"] })).toEqual([]);
    expect(webPushUserIds({ frameUserId: "ada", live: new Set(), storedUserIds: ["ada"] })).toEqual(["ada"]);
    expect(webPushUserIds({
      live,
      storedUserIds: ["ada", "bob", "bob", ""],
    })).toEqual(["bob"]);
  });
});
