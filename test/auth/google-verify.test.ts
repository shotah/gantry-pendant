import { describe, expect, it } from "vitest";
import { verifyIdToken } from "@/lib/auth/google";

describe("verifyIdToken", () => {
  it("rejects junk without leaking a token", async () => {
    expect(await verifyIdToken("not-a-jwt", "client")).toBeNull();
  });
});
