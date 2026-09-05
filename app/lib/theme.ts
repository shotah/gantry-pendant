/** Pendant themes — a mouth, not the yard board. */

export const THEME_KEY = "pendant.theme";

type ThemeTokens = {
  scheme: "dark" | "light";
  canvas: string;
  panel: string;
  track: string;
  line: string;
  edge: string;
  fg: string;
  body: string;
  muted: string;
  dim: string;
  faint: string;
  accent: string;
  accentHover: string;
  mark: string;
  accentLine: string;
  accentSoft: string;
  danger: string;
  dangerLine: string;
  dangerSoft: string;
  ok: string;
  info: string;
  you: string;
  kit: string;
};

export const THEMES = [
  {
    id: "night",
    label: "Night",
    tokens: {
      scheme: "dark",
      canvas: "#0c0a09",
      panel: "#1c1917",
      track: "#292524",
      line: "#3f3a36",
      edge: "#57534e",
      fg: "#fafaf9",
      body: "#e7e5e4",
      muted: "#a8a29e",
      dim: "#78716c",
      faint: "#57534e",
      accent: "#e8b86d",
      accentHover: "#f2d19a",
      mark: "#fde68a",
      accentLine: "#a16207",
      accentSoft: "#2a2114",
      danger: "#fda4af",
      dangerLine: "#9f1239",
      dangerSoft: "#2a1218",
      ok: "#6ee7b7",
      info: "#7dd3fc",
      you: "#3f2e14",
      kit: "#1c1917",
    } satisfies ThemeTokens,
  },
  {
    id: "ember",
    label: "Night · ember",
    tokens: {
      scheme: "dark",
      canvas: "#140c0a",
      panel: "#241614",
      track: "#3a1f18",
      line: "#5c2e22",
      edge: "#7c3a28",
      fg: "#fff7ed",
      body: "#fed7aa",
      muted: "#fdba74",
      dim: "#c2410c",
      faint: "#7c2d12",
      accent: "#fb7185",
      accentHover: "#fda4af",
      mark: "#fecdd3",
      accentLine: "#be123c",
      accentSoft: "#3a1218",
      danger: "#fb7185",
      dangerLine: "#e11d48",
      dangerSoft: "#3a0814",
      ok: "#fbbf24",
      info: "#fdba74",
      you: "#4a1d18",
      kit: "#241614",
    } satisfies ThemeTokens,
  },
  {
    id: "day",
    label: "Day",
    tokens: {
      scheme: "light",
      canvas: "#f6f1ea",
      panel: "#fffdf8",
      track: "#ece4d8",
      line: "#d4c4b0",
      edge: "#b08968",
      fg: "#1c140c",
      body: "#3d2f22",
      muted: "#6b5344",
      dim: "#8a7364",
      faint: "#b8a090",
      accent: "#8b4513",
      accentHover: "#6b3410",
      mark: "#5c2e12",
      accentLine: "#b08968",
      accentSoft: "#f0e4d4",
      danger: "#9f1239",
      dangerLine: "#9f1239",
      dangerSoft: "#f8d0d8",
      ok: "#047857",
      info: "#0f4c81",
      you: "#f0e4d4",
      kit: "#fffdf8",
    } satisfies ThemeTokens,
  },
  {
    id: "fog",
    label: "Day · fog",
    tokens: {
      scheme: "light",
      canvas: "#e8eef3",
      panel: "#f7fafc",
      track: "#d5e0ea",
      line: "#9aaebb",
      edge: "#5c7384",
      fg: "#0f1720",
      body: "#1e2936",
      muted: "#3d5160",
      dim: "#5c7384",
      faint: "#8a9eac",
      accent: "#0f4c5c",
      accentHover: "#0a3640",
      mark: "#134e4a",
      accentLine: "#2a6f7a",
      accentSoft: "#d4e8ec",
      danger: "#9f1239",
      dangerLine: "#9f1239",
      dangerSoft: "#f0c8d4",
      ok: "#0f766e",
      info: "#0369a1",
      you: "#d4e8ec",
      kit: "#f7fafc",
    } satisfies ThemeTokens,
  },
  {
    id: "contrast",
    label: "High contrast",
    tokens: {
      scheme: "dark",
      canvas: "#000000",
      panel: "#0a0a0a",
      track: "#1a1a1a",
      line: "#ffff00",
      edge: "#ffff00",
      fg: "#ffffff",
      body: "#ffffff",
      muted: "#e0e0e0",
      dim: "#c0c0c0",
      faint: "#a0a0a0",
      accent: "#ffff00",
      accentHover: "#ffff99",
      mark: "#ffff00",
      accentLine: "#ffff00",
      accentSoft: "#1a1a00",
      danger: "#ff0040",
      dangerLine: "#ff0040",
      dangerSoft: "#33000d",
      ok: "#00ff80",
      info: "#00ffff",
      you: "#1a1a00",
      kit: "#0a0a0a",
    } satisfies ThemeTokens,
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "night";

export function themeOf(id: ThemeId = DEFAULT_THEME) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

const THEME_IDS: readonly string[] = THEMES.map((t) => t.id);

export function parseTheme(v: unknown): ThemeId {
  return typeof v === "string" && THEME_IDS.includes(v) ? (v as ThemeId) : DEFAULT_THEME;
}

export function themeFromQuery(v: string | null): ThemeId | null {
  return typeof v === "string" && THEME_IDS.includes(v) ? (v as ThemeId) : null;
}

export function themeCss(): string {
  return THEMES.map((t) => {
    const sel = t.id === DEFAULT_THEME ? `:root,[data-theme="${t.id}"]` : `[data-theme="${t.id}"]`;
    return `${sel}{${tokenCss(t.tokens)}}`;
  }).join("");
}

export function applyTheme(id: ThemeId): void {
  if (document.documentElement.getAttribute("data-theme") === id && localStorage.getItem(THEME_KEY) === id) {
    return;
  }
  document.documentElement.setAttribute("data-theme", id);
  localStorage.setItem(THEME_KEY, id);
  const canvas = getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim();
  if (canvas) {
    document.querySelector("meta[name=theme-color]")?.setAttribute("content", canvas);
  }
  window.dispatchEvent(new Event("pendant-theme"));
}

export const THEME_BOOT
  = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});var a=${JSON.stringify(THEME_IDS)};if(a.indexOf(t)!==-1)document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

function tokenCss(tokens: ThemeTokens): string {
  const parts = [`color-scheme:${tokens.scheme}`];
  for (const [k, v] of Object.entries(tokens)) {
    if (k === "scheme") {
      continue;
    }
    const cssKey = k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    parts.push(`--${cssKey}:${v}`);
  }
  return parts.join(";");
}
