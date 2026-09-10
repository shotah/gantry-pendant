import { describe, expect, it } from "vitest";
import { capThread, rememberSeen } from "@/app/lib/thread";

describe("thread caps", () => {
  it("keeps the newest messages", () => {
    expect(capThread([1, 2, 3], 2)).toEqual([2, 3]);
    expect(capThread([1, 2], 5)).toEqual([1, 2]);
  });

  it("drops oldest seen ids first", () => {
    const seen = new Set(["a", "b", "c"]);
    rememberSeen(seen, "d", 3);
    expect([...seen]).toEqual(["b", "c", "d"]);
  });
});
