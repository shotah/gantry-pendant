import { describe, expect, it } from "vitest";
import { GEO_PREF_KEY, geoPrefOn, PHOTO_PREF_KEY, photoSizePref, writeGeoPref, writePhotoSizePref } from "@/lib/phone/prefs";

function memStorage() {
  const mem = new Map<string, string>();
  return {
    mem,
    storage: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
    },
  };
}

describe("photo size pref", () => {
  it("defaults medium, round-trips, and shrugs off junk", () => {
    const { mem, storage } = memStorage();
    expect(photoSizePref(null)).toBe("medium");
    expect(photoSizePref(storage)).toBe("medium");
    writePhotoSizePref(storage, "small");
    expect(mem.get(PHOTO_PREF_KEY)).toBe("small");
    expect(photoSizePref(storage)).toBe("small");
    mem.set(PHOTO_PREF_KEY, "gigantic");
    expect(photoSizePref(storage)).toBe("medium");
  });
});

describe("geo pref", () => {
  it("defaults on and only treats off as disabled", () => {
    const { mem, storage } = memStorage();
    expect(geoPrefOn(null)).toBe(true);
    expect(geoPrefOn(storage)).toBe(true);
    writeGeoPref(storage, false);
    expect(mem.get(GEO_PREF_KEY)).toBe("off");
    expect(geoPrefOn(storage)).toBe(false);
    writeGeoPref(storage, true);
    expect(geoPrefOn(storage)).toBe(true);
  });
});
