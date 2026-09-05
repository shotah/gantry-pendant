import { describe, expect, it } from "vitest";
import { badFrame, configError, tooLarge, tooMany, unauthorized } from "@/lib/auth/deny";

describe("deny", () => {
  it("uses the same unauthorized body", async () => {
    const r = unauthorized();
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "unauthorized" });
    expect(tooLarge().status).toBe(413);
    expect(tooMany().status).toBe(429);
    expect(badFrame().status).toBe(400);
    expect(configError().status).toBe(503);
  });
});
