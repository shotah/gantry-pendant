/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { applyTheme, DEFAULT_THEME, parseTheme, THEME_BOOT, themeCss, themeFromQuery, themeOf, THEMES } from "@/app/lib/theme";

describe("theme", () => {
  it("falls back to night", () => {
    expect(parseTheme(undefined)).toBe(DEFAULT_THEME);
    expect(parseTheme("nope")).toBe("night");
    expect(parseTheme("fog")).toBe("fog");
    expect(themeFromQuery("day")).toBe("day");
    expect(themeFromQuery("nope")).toBeNull();
    expect(themeFromQuery(null)).toBeNull();
  });

  it("ships dark, light, variants, and high contrast", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["night", "ember", "day", "fog", "contrast"]);
    expect(THEMES.map((t) => t.label)).toEqual(["Night", "Night · ember", "Day", "Day · fog", "High contrast"]);
    const css = themeCss();
    expect(css).toContain(':root,[data-theme="night"]');
    expect(css).toContain("color-scheme:light");
    expect(css).toContain("color-scheme:dark");
    const keys = Object.keys(THEMES[0].tokens).sort();
    for (const t of THEMES) {
      expect(Object.keys(t.tokens).sort()).toEqual(keys);
      expect(css).toContain(`[data-theme="${t.id}"]`);
      expect(css).toContain(`--canvas:${t.tokens.canvas}`);
      expect(css).toContain(`--you:${t.tokens.you}`);
    }
    expect(THEME_BOOT).toContain("pendant.theme");
    expect(themeOf("contrast").tokens.accent).toBe("#ffff00");
    expect(themeOf("nope" as "night").id).toBe("night");
  });

  it("applies a theme on the document", () => {
    applyTheme("day");
    expect(document.documentElement.getAttribute("data-theme")).toBe("day");
    expect(localStorage.getItem("pendant.theme")).toBe("day");
    applyTheme("day");
    applyTheme("ember");
    expect(document.documentElement.getAttribute("data-theme")).toBe("ember");
  });
});
