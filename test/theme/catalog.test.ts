import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, knownTheme, parseTheme, themeCards, themeIdList, themeOf, THEMES } from "@/lib/theme/catalog";
import { themeContrastFails } from "@/lib/theme/contrast";

describe("theme catalog", () => {
  it("keeps Boom / Inlay / Lamp hexes and adds noir, ember, tide, bloom", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["boom", "inlay", "lamp", "noir", "ember", "tide", "bloom"]);
    expect(themeOf("boom").tokens.canvas).toBe("#0e1316");
    expect(themeOf("boom").tokens.accent).toBe("#f07848");
    expect(themeOf("inlay").tokens.accent).toBe("#e6d3b0");
    expect(themeOf("lamp").tokens.accent).toBe("#c5d24a");
    expect(themeOf("noir").tokens.accent).toBe("#8eb4d4");
    expect(themeOf("ember").tokens.accent).toBe("#e07040");
    expect(themeOf("tide").tokens.accent).toBe("#3cb8b0");
    expect(themeOf("bloom").tokens.accent).toBe("#d070c0");
    expect(parseTheme("lamp")).toBe("lamp");
    expect(parseTheme("nope")).toBe(DEFAULT_THEME);
    expect(knownTheme("noir")).toBe("noir");
    expect(knownTheme("nope")).toBeNull();
    expect(themeOf("nope" as "boom").id).toBe("boom");
  });

  it("cards are id + mood + the two signature hexes, never the full token dump", () => {
    const cards = themeCards();
    expect(cards).toHaveLength(THEMES.length);
    for (const t of THEMES) {
      expect(t.mood.length).toBeGreaterThan(12);
      expect(t.mood.includes(t.tokens.canvas)).toBe(false);
      const card = cards.find((c) => c.id === t.id);
      expect(card).toEqual({
        id: t.id,
        label: t.label,
        mood: t.mood,
        canvas: t.tokens.canvas,
        accent: t.tokens.accent,
      });
    }
    expect(themeIdList()).toEqual(THEMES.map((t) => t.id));
  });

  it("every theme meets AA on the painted pairs", () => {
    const fails = THEMES.flatMap((t) => themeContrastFails(t));
    expect(fails).toEqual([]);
  });
});
