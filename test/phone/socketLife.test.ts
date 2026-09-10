import { describe, expect, it } from "vitest";
import { shouldDropMailboxOnHide, shouldReconnectMailbox } from "@/lib/phone/socketLife";

describe("mailbox socket life", () => {
  it("drops the phone socket when the thread is hidden", () => {
    expect(shouldDropMailboxOnHide("phone", "hidden")).toBe(true);
    expect(shouldDropMailboxOnHide("phone", "visible")).toBe(false);
    expect(shouldDropMailboxOnHide("crane", "hidden")).toBe(false);
  });

  it("does not reconnect a hidden phone", () => {
    expect(shouldReconnectMailbox({
      role: "phone",
      visibilityState: "hidden",
      stopped: false,
    })).toBe(false);
    expect(shouldReconnectMailbox({
      role: "phone",
      visibilityState: "visible",
      stopped: false,
    })).toBe(true);
    expect(shouldReconnectMailbox({
      role: "crane",
      visibilityState: "hidden",
      stopped: false,
    })).toBe(true);
    expect(shouldReconnectMailbox({
      role: "phone",
      visibilityState: "visible",
      stopped: true,
    })).toBe(false);
  });
});
