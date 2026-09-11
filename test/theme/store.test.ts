import { describe, expect, it } from "vitest";
import { parseFrame } from "@/lib/mailbox/frame";
import { themeCards } from "@/lib/theme/catalog";
import { encodeThemeNotice, encodeThemeState, isThemeNotice, parseThemeWrite, themeIdFromUnknown } from "@/lib/theme/store";

describe("parseThemeWrite", () => {
  it("accepts a known id and refuses junk", () => {
    expect(parseThemeWrite({ theme: "noir" })).toEqual({ ok: true, theme: "noir" });
    expect(parseThemeWrite({ theme: "nope" })).toEqual({ ok: false, detail: "bad theme" });
    expect(parseThemeWrite({ theme: "boom", extra: 1 }).ok).toBe(true);
    expect(parseThemeWrite(null).ok).toBe(false);
    expect(parseThemeWrite("noir").ok).toBe(false);
  });
});

describe("theme notice", () => {
  it("carries the id and no text, so a mouth that does not know it drops it", () => {
    const wire = encodeThemeNotice("noir");
    const raw = JSON.parse(wire) as Record<string, unknown>;
    expect(raw).toEqual({ kind: "theme", theme: "noir" });
    expect("text" in raw).toBe(false);
    expect("images" in raw).toBe(false);
  });

  it("round-trips an id, treats null as cleared, and ignores chat frames and junk", () => {
    expect(themeIdFromUnknown(JSON.parse(encodeThemeNotice("lamp")))).toBe("lamp");
    expect(themeIdFromUnknown(JSON.parse(encodeThemeNotice(null)))).toBe("");
    expect(themeIdFromUnknown({ kind: "theme", theme: "nope" })).toBeNull();
    expect(themeIdFromUnknown({ kind: "theme", text: "lamp" })).toBe("");
    expect(isThemeNotice({ kind: "theme", theme: "nope" })).toBe(true);
    expect(isThemeNotice({ kind: "reply", theme: "noir" })).toBe(false);
    expect(themeIdFromUnknown({ kind: "theme", text: "lamp" })).toBe("");
    expect(themeIdFromUnknown({ kind: "face", text: "42" })).toBeNull();
    expect(themeIdFromUnknown({ kind: "backdrop", rev: 1 })).toBeNull();
    expect(themeIdFromUnknown({ kind: "reply", text: "hi", theme: "noir" })).toBeNull();
    expect(themeIdFromUnknown(null)).toBeNull();
  });

  it("is not a mailbox frame kind: a phone that sends it is refused", () => {
    const got = parseFrame(encodeThemeNotice("noir"), { role: "phone" });
    expect(got.ok).toBe(false);
    if (!got.ok) {
      expect(got.error).toBe("bad frame");
    }
  });
});

describe("encodeThemeState", () => {
  it("GET body is current id plus the catalog cards", () => {
    const raw = JSON.parse(encodeThemeState("tide")) as { theme: string; themes: unknown[] };
    expect(raw.theme).toBe("tide");
    expect(raw.themes).toEqual(themeCards());
    expect(JSON.parse(encodeThemeState(null)).theme).toBeNull();
  });
});
