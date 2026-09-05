import { describe, expect, it } from "vitest";
import { GEO_PREF_KEY, geoPrefOn, writeGeoPref } from "@/lib/phone/prefs";

describe("geo pref", () => {
  it("defaults on and only treats off as disabled", () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
    };
    expect(geoPrefOn(null)).toBe(true);
    expect(geoPrefOn(storage)).toBe(true);
    writeGeoPref(storage, false);
    expect(mem.get(GEO_PREF_KEY)).toBe("off");
    expect(geoPrefOn(storage)).toBe(false);
    writeGeoPref(storage, true);
    expect(geoPrefOn(storage)).toBe(true);
  });
});
