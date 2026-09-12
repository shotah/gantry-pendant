/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  applyTheme,
  cacheRoomTheme,
  cachedRoomTheme,
  DEFAULT_THEME,
  paintTheme,
  parseTheme,
  ROOM_THEME_KEY,
  THEME_BOOT,
  THEME_KEY,
  themeCss,
  themeFromQuery,
  themeOf,
  THEMES,
} from "@/app/lib/theme";
import { FOLLOW_THEME_PREF_KEY } from "@/lib/phone/prefs";

describe("theme", () => {
  it("falls back to boom", () => {
    expect(parseTheme(undefined)).toBe(DEFAULT_THEME);
    expect(parseTheme("nope")).toBe("boom");
    expect(parseTheme("inlay")).toBe("inlay");
    expect(themeFromQuery("lamp")).toBe("lamp");
    expect(themeFromQuery("noir")).toBe("noir");
    expect(themeFromQuery("nope")).toBeNull();
    expect(themeFromQuery(null)).toBeNull();
  });

  it("ships Boom, Inlay, Lamp, night moods, daylight cousins, and ink", () => {
    expect(THEMES.map((t) => t.id)).toEqual([
      "boom",
      "inlay",
      "lamp",
      "noir",
      "ember",
      "tide",
      "bloom",
      "paper",
      "chalk",
      "foam",
      "petal",
      "ink",
    ]);
    expect(THEMES.map((t) => t.label)).toEqual([
      "Boom",
      "Inlay",
      "Lamp",
      "Noir",
      "Ember",
      "Tide",
      "Bloom",
      "Paper",
      "Chalk",
      "Foam",
      "Petal",
      "Ink",
    ]);
    const css = themeCss();
    expect(css).toContain(':root,[data-theme="boom"]');
    expect(css).toContain("color-scheme:dark");
    expect(css).toContain("color-scheme:light");
    const keys = Object.keys(THEMES[0].tokens).sort();
    for (const t of THEMES) {
      expect(Object.keys(t.tokens).sort()).toEqual(keys);
      expect(css).toContain(`[data-theme="${t.id}"]`);
      expect(css).toContain(`--canvas:${t.tokens.canvas}`);
      expect(css).toContain(`--you:${t.tokens.you}`);
      expect(css).toContain(`color-scheme:${t.tokens.scheme}`);
    }
    expect(themeOf("paper").tokens.scheme).toBe("light");
    expect(themeOf("ink").tokens.scheme).toBe("dark");
    expect(THEME_BOOT).toContain(THEME_KEY);
    expect(THEME_BOOT).toContain(ROOM_THEME_KEY);
    expect(THEME_BOOT).toContain(FOLLOW_THEME_PREF_KEY);
    expect(themeOf("boom").tokens.canvas).toBe("#0e1316");
    expect(themeOf("boom").tokens.accent).toBe("#f07848");
    expect(themeOf("inlay").tokens.accent).toBe("#e6d3b0");
    expect(themeOf("lamp").tokens.accent).toBe("#c5d24a");
    expect(themeOf("nope" as "boom").id).toBe("boom");
  });

  it("paints a room theme without claiming the human's pick", () => {
    localStorage.setItem(THEME_KEY, "boom");
    paintTheme("noir");
    expect(document.documentElement.getAttribute("data-theme")).toBe("noir");
    expect(localStorage.getItem(THEME_KEY)).toBe("boom");
    applyTheme("inlay");
    expect(document.documentElement.getAttribute("data-theme")).toBe("inlay");
    expect(localStorage.getItem(THEME_KEY)).toBe("inlay");
    applyTheme("inlay");
    applyTheme("lamp");
    expect(document.documentElement.getAttribute("data-theme")).toBe("lamp");
  });

  it("caches the last room theme for boot", () => {
    cacheRoomTheme("tide");
    expect(localStorage.getItem(ROOM_THEME_KEY)).toBe("tide");
    expect(cachedRoomTheme()).toBe("tide");
    cacheRoomTheme(null);
    expect(cachedRoomTheme()).toBeNull();
  });
});
