import type { ThemeDef, ThemeTokens } from "./catalog";

/** WCAG relative luminance for a `#rrggbb` hex. Junk is 0. */
export function hexLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) {
    return 0;
  }
  const n = Number.parseInt(m[1], 16);
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Contrast ratio of two hex colors. 1 is same; 21 is black on white. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [hexLuminance(a), hexLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

type Pair = { name: string; fg: keyof ThemeTokens; bg: keyof ThemeTokens; min: number };

/** Text-on-surface pairs a mouth actually paints. AA 4.5 for body, 3.0 for muted. */
export const THEME_CONTRAST_PAIRS: readonly Pair[] = [
  { name: "fg on canvas", fg: "fg", bg: "canvas", min: 4.5 },
  { name: "fg on panel", fg: "fg", bg: "panel", min: 4.5 },
  { name: "body on canvas", fg: "body", bg: "canvas", min: 4.5 },
  { name: "body on panel", fg: "body", bg: "panel", min: 4.5 },
  { name: "fg on you", fg: "fg", bg: "you", min: 4.5 },
  { name: "body on kit", fg: "body", bg: "kit", min: 4.5 },
  { name: "muted on panel", fg: "muted", bg: "panel", min: 3 },
  { name: "mark on accent-soft", fg: "mark", bg: "accentSoft", min: 4.5 },
];

export type ContrastFail = { id: string; pair: string; ratio: number; min: number };

export function themeContrastFails(theme: ThemeDef): ContrastFail[] {
  const out: ContrastFail[] = [];
  for (const pair of THEME_CONTRAST_PAIRS) {
    const ratio = contrastRatio(theme.tokens[pair.fg], theme.tokens[pair.bg]);
    if (ratio < pair.min) {
      out.push({ id: theme.id, pair: pair.name, ratio, min: pair.min });
    }
  }
  return out;
}
