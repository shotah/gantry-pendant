import { describe, expect, it } from "vitest";
import { parseExpMs, socketMessageAllowed } from "@/lib/mailbox/socketAuth";

const ada = "ada-sub:ada@example.test";

describe("socketAuth", () => {
  it("closes on a yanked sub", () => {
    expect(socketMessageAllowed({
      role: "phone",
      userId: "bob-sub",
      allowedSubs: ada,
      now: 1_000,
    })).toBe(false);
  });

  it("closes when exp has passed", () => {
    expect(socketMessageAllowed({
      role: "phone",
      userId: "ada-sub",
      allowedSubs: ada,
      expMs: 1_000,
      now: 1_001,
    })).toBe(false);
  });

  it("closes when the phone sub is missing", () => {
    expect(socketMessageAllowed({
      role: "phone",
      allowedSubs: ada,
      now: 1_000,
    })).toBe(false);
  });

  it("skips the check in spike mode and for crane sockets", () => {
    expect(socketMessageAllowed({
      role: "phone",
      userId: "anyone",
      allowedSubs: "",
      now: 1_000,
    })).toBe(true);
    expect(socketMessageAllowed({
      role: "crane",
      userId: "not-a-human",
      allowedSubs: ada,
      now: 1_000,
    })).toBe(true);
  });

  it("allows a listed sub before expiry", () => {
    expect(socketMessageAllowed({
      role: "phone",
      userId: "ada-sub",
      allowedSubs: ada,
      expMs: 2_000,
      now: 1_000,
    })).toBe(true);
    expect(socketMessageAllowed({
      role: "phone",
      userId: "ada-sub",
      allowedSubs: ada,
      now: 1_000,
    })).toBe(true);
  });

  it("parses decimal millisecond exp tags", () => {
    expect(parseExpMs("1710000000000")).toBe(1_710_000_000_000);
    expect(parseExpMs(undefined)).toBeUndefined();
    expect(parseExpMs("")).toBeUndefined();
    expect(parseExpMs("nope")).toBeUndefined();
    expect(parseExpMs("0")).toBeUndefined();
  });
});
