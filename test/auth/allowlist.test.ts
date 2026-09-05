import { describe, expect, it } from "vitest";
import { allowlistMap, isAllowed, parseAllowlist } from "@/lib/auth/allowlist";

describe("allowlist", () => {
  it("parses sub and optional email labels", () => {
    const list = parseAllowlist("1182:ada@x.com, 1183 ,1182:dup@x.com");
    expect(list).toEqual([
      { sub: "1182", email: "ada@x.com" },
      { sub: "1183" },
    ]);
    const map = allowlistMap("1182:ada@x.com");
    expect(isAllowed(map, "1182")).toBe(true);
    expect(isAllowed(map, "nope")).toBe(false);
  });

  it("treats empty as a config problem for the caller", () => {
    expect(parseAllowlist("")).toEqual([]);
    expect(parseAllowlist("   ,  ")).toEqual([]);
    expect(allowlistMap(undefined).size).toBe(0);
  });
});
