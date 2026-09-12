import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, knownTheme, parseTheme, themeCards, themeIdList, themeOf, THEMES } from "@/lib/theme/catalog";
import { contrastRatio, themeContrastFails } from "@/lib/theme/contrast";

const IDS = [
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
] as const;

describe("theme catalog", () => {
  it("keeps Boom / Inlay / Lamp hexes and adds night plus daylight cousins", () => {
    expect(THEMES.map((t) => t.id)).toEqual([...IDS]);
    expect(themeOf("boom").tokens.canvas).toBe("#0e1316");
    expect(themeOf("boom").tokens.accent).toBe("#f07848");
    expect(themeOf("inlay").tokens.accent).toBe("#e6d3b0");
    expect(themeOf("lamp").tokens.accent).toBe("#c5d24a");
    expect(themeOf("noir").tokens.accent).toBe("#8eb4d4");
    expect(themeOf("ember").tokens.accent).toBe("#e07040");
    expect(themeOf("tide").tokens.accent).toBe("#3cb8b0");
    expect(themeOf("bloom").tokens.accent).toBe("#d070c0");
    expect(themeOf("paper").tokens.scheme).toBe("light");
    expect(themeOf("paper").tokens.accent).toBe("#c24a28");
    expect(themeOf("chalk").tokens.scheme).toBe("light");
    expect(themeOf("foam").tokens.scheme).toBe("light");
    expect(themeOf("petal").tokens.scheme).toBe("light");
    expect(themeOf("ink").tokens.scheme).toBe("dark");
    expect(themeOf("ink").tokens.accent).toBe("#f0b020");
    expect(parseTheme("lamp")).toBe("lamp");
    expect(parseTheme("paper")).toBe("paper");
    expect(parseTheme("nope")).toBe(DEFAULT_THEME);
    expect(knownTheme("noir")).toBe("noir");
    expect(knownTheme("chalk")).toBe("chalk");
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

  it("daylight and ink keep dim and faint readable", () => {
    const extra = THEMES.filter((t) => t.tokens.scheme === "light" || t.id === "ink");
    expect(extra.map((t) => t.id)).toEqual(["paper", "chalk", "foam", "petal", "ink"]);
    for (const t of extra) {
      expect(contrastRatio(t.tokens.dim, t.tokens.kit)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.tokens.dim, t.tokens.you)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.tokens.faint, t.tokens.panel)).toBeGreaterThanOrEqual(3);
    }
  });
});
