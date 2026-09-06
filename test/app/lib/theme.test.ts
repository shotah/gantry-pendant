/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { applyTheme, DEFAULT_THEME, parseTheme, THEME_BOOT, themeCss, themeFromQuery, themeOf, THEMES } from "@/app/lib/theme";

describe("theme", () => {
  it("falls back to boom", () => {
    expect(parseTheme(undefined)).toBe(DEFAULT_THEME);
    expect(parseTheme("nope")).toBe("boom");
    expect(parseTheme("inlay")).toBe("inlay");
    expect(themeFromQuery("lamp")).toBe("lamp");
    expect(themeFromQuery("nope")).toBeNull();
    expect(themeFromQuery(null)).toBeNull();
  });

  it("ships Boom, Inlay, and Lamp", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["boom", "inlay", "lamp"]);
    expect(THEMES.map((t) => t.label)).toEqual(["Boom", "Inlay", "Lamp"]);
    const css = themeCss();
    expect(css).toContain(':root,[data-theme="boom"]');
    expect(css).toContain("color-scheme:dark");
    expect(css).not.toContain("color-scheme:light");
    const keys = Object.keys(THEMES[0].tokens).sort();
    for (const t of THEMES) {
      expect(t.tokens.scheme).toBe("dark");
      expect(Object.keys(t.tokens).sort()).toEqual(keys);
      expect(css).toContain(`[data-theme="${t.id}"]`);
      expect(css).toContain(`--canvas:${t.tokens.canvas}`);
      expect(css).toContain(`--you:${t.tokens.you}`);
    }
    expect(THEME_BOOT).toContain("pendant.theme");
    expect(themeOf("boom").tokens.canvas).toBe("#0e1316");
    expect(themeOf("boom").tokens.accent).toBe("#f07848");
    expect(themeOf("inlay").tokens.accent).toBe("#e6d3b0");
    expect(themeOf("lamp").tokens.accent).toBe("#c5d24a");
    expect(themeOf("nope" as "boom").id).toBe("boom");
  });

  it("applies a theme on the document", () => {
    applyTheme("inlay");
    expect(document.documentElement.getAttribute("data-theme")).toBe("inlay");
    expect(localStorage.getItem("pendant.theme")).toBe("inlay");
    applyTheme("inlay");
    applyTheme("lamp");
    expect(document.documentElement.getAttribute("data-theme")).toBe("lamp");
  });
});
