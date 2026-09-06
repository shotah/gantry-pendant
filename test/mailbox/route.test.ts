import { describe, expect, it } from "vitest";
import { persistRole, phoneKindAllowed, resolvePhoneKind, routeTag } from "@/lib/mailbox/route";
import type { WireFrame } from "@/lib/mailbox/frame";

describe("route", () => {
  it("sends reply to that user's sockets only", () => {
    expect(routeTag("crane", { kind: "reply", user_id: "ada" })).toBe("ada");
    expect(routeTag("crane", { kind: "reply" })).toBeUndefined();
    expect(routeTag("crane", { kind: "error", user_id: "ada" })).toBe("ada");
    expect(routeTag("crane", { kind: "error" })).toBe("phone");
  });

  it("broadcasts push with no user_id and targets push with user_id", () => {
    expect(routeTag("crane", { kind: "push" })).toBe("phone");
    expect(routeTag("crane", { kind: "push", user_id: "ada" })).toBe("ada");
  });

  it("sends phone frames to crane", () => {
    expect(routeTag("phone", { kind: "inbound", text: "hi" })).toBe("crane");
    expect(routeTag("phone", { kind: "pin" })).toBe("crane");
    expect(routeTag("phone", { kind: "ack", id: "1" })).toBe("crane");
  });

  it("allows inbound pin ack from the phone and rejects crane kinds", () => {
    expect(resolvePhoneKind({ kind: "inbound" })).toBe("inbound");
    expect(resolvePhoneKind({ kind: "pin" })).toBe("pin");
    expect(resolvePhoneKind({ kind: "ack" })).toBe("ack");
    expect(resolvePhoneKind({ text: "hi" })).toBe("inbound");
    expect(resolvePhoneKind({ images: [{ url: "data:image/jpeg;base64,aa" }] })).toBe("inbound");
    expect(resolvePhoneKind({ context: { geo: { lat: 1, lon: 2 } } })).toBe("pin");
    expect(phoneKindAllowed({})).toBe(false);
    const banned: WireFrame[] = [
      { kind: "reply" },
      { kind: "push" },
      { kind: "error" },
      { kind: "cmds" },
    ];
    for (const frame of banned) {
      expect(phoneKindAllowed(frame)).toBe(false);
      expect(resolvePhoneKind(frame)).toBeUndefined();
    }
  });

  it("persists phone-bound reply/push and skips pin", () => {
    expect(persistRole("crane", "reply", "ada")).toBe("phone");
    expect(persistRole("crane", "reply")).toBeUndefined();
    expect(persistRole("crane", "push")).toBe("phone");
    expect(persistRole("crane", "error", "ada")).toBe("phone");
    expect(persistRole("phone", "inbound")).toBe("crane");
    expect(persistRole("phone", "pin")).toBeUndefined();
    expect(persistRole("phone", "ack")).toBeUndefined();
  });
});
