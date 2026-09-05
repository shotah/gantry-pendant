import { describe, expect, it } from "vitest";
import { bearerForSlug, parseBearers } from "@/lib/auth/bearer";

describe("bearer", () => {
  it("binds a token to one slug", () => {
    const map = parseBearers("kit:alpha,ada:beta, :skip,nocolon");
    expect(map.get("kit")).toBe("alpha");
    expect(bearerForSlug(map, "kit", "alpha")).toBe(true);
    expect(bearerForSlug(map, "ada", "alpha")).toBe(false);
    expect(bearerForSlug(map, "kit", "beta")).toBe(false);
    expect(bearerForSlug(map, "nope", "alpha")).toBe(false);
  });

  it("handles empty env", () => {
    expect(parseBearers("").size).toBe(0);
    expect(parseBearers(undefined).size).toBe(0);
  });
});
