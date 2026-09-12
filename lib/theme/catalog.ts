/** Room color themes. Boom / Inlay / Lamp hexes are shared with gantree — do not drift those three. */

export type ThemeScheme = "dark" | "light";

export type ThemeCore = {
  scheme: ThemeScheme;
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
};

export type ThemeTokens = ThemeCore & {
  you: string;
  kit: string;
};

export type ThemeDef = {
  id: string;
  label: string;
  /** One line for the agent. Mood + the two colors it can see without a screenshot. */
  mood: string;
  tokens: ThemeTokens;
};

/** Shared with gantree — do not drift these hex values. */
const BOOM = {
  scheme: "dark",
  canvas: "#0e1316",
  panel: "#171d22",
  track: "#232b32",
  line: "#3a4550",
  edge: "#5c6772",
  fg: "#f4f0ea",
  body: "#dcd6ce",
  muted: "#9aa3ab",
  dim: "#84909a",
  faint: "#5a6570",
  accent: "#f07848",
  accentHover: "#f89068",
  mark: "#f3b199",
  accentLine: "#c24a28",
  accentSoft: "#2a1612",
  danger: "#e070a0",
  dangerLine: "#a03860",
  dangerSoft: "#2a121c",
  ok: "#3db8a0",
  info: "#6ba8c9",
} as const satisfies ThemeCore;

const INLAY = {
  scheme: "dark",
  canvas: "#0c110f",
  panel: "#151c19",
  track: "#1e2823",
  line: "#33423b",
  edge: "#5a6e64",
  fg: "#f2ebe0",
  body: "#d9d0c4",
  muted: "#a3ada6",
  dim: "#8a948c",
  faint: "#5a6560",
  accent: "#e6d3b0",
  accentHover: "#f0e0c4",
  mark: "#f7ebd4",
  accentLine: "#a89068",
  accentSoft: "#243028",
  danger: "#d4787a",
  dangerLine: "#8a4042",
  dangerSoft: "#2a1818",
  ok: "#6baf9a",
  info: "#7aa8b8",
} as const satisfies ThemeCore;

const LAMP = {
  scheme: "dark",
  canvas: "#0c0c16",
  panel: "#151522",
  track: "#1e1e2e",
  line: "#32324a",
  edge: "#5a5a78",
  fg: "#eef0e6",
  body: "#d5d8c8",
  muted: "#9aa090",
  dim: "#8a9088",
  faint: "#5a6058",
  accent: "#c5d24a",
  accentHover: "#d4e05a",
  mark: "#e4eec8",
  accentLine: "#8a9430",
  accentSoft: "#222418",
  danger: "#e07090",
  dangerLine: "#a03850",
  dangerSoft: "#2a1218",
  ok: "#5ec8b0",
  info: "#8aa0e0",
} as const satisfies ThemeCore;

const NOIR = {
  scheme: "dark",
  canvas: "#0a0c10",
  panel: "#12151a",
  track: "#1a1f28",
  line: "#2e3644",
  edge: "#5a6578",
  fg: "#e8eef4",
  body: "#c5ced8",
  muted: "#8a96a8",
  dim: "#6e7a8c",
  faint: "#4a5464",
  accent: "#8eb4d4",
  accentHover: "#a8c8e4",
  mark: "#d4e4f4",
  accentLine: "#4a78a0",
  accentSoft: "#121820",
  danger: "#d07090",
  dangerLine: "#a03860",
  dangerSoft: "#241018",
  ok: "#5cb8a8",
  info: "#7aa0c8",
} as const satisfies ThemeCore;

const EMBER = {
  scheme: "dark",
  canvas: "#120c0a",
  panel: "#1a1210",
  track: "#261c16",
  line: "#4a3430",
  edge: "#7a5850",
  fg: "#f4ece4",
  body: "#dcc8bc",
  muted: "#b09080",
  dim: "#8a7064",
  faint: "#5a4840",
  accent: "#e07040",
  accentHover: "#f08858",
  mark: "#f4c4a0",
  accentLine: "#a04828",
  accentSoft: "#241410",
  danger: "#e07090",
  dangerLine: "#a03850",
  dangerSoft: "#2a1014",
  ok: "#6bb090",
  info: "#7aa8c0",
} as const satisfies ThemeCore;

const TIDE = {
  scheme: "dark",
  canvas: "#0a1214",
  panel: "#101a1c",
  track: "#182428",
  line: "#2a3c44",
  edge: "#4a6870",
  fg: "#e4f0ee",
  body: "#c4d8d4",
  muted: "#88a8a8",
  dim: "#6e8888",
  faint: "#4a6060",
  accent: "#3cb8b0",
  accentHover: "#58d0c8",
  mark: "#b8ece4",
  accentLine: "#2a7878",
  accentSoft: "#102020",
  danger: "#d07890",
  dangerLine: "#a04058",
  dangerSoft: "#1c1018",
  ok: "#4cbc9c",
  info: "#6aa8c8",
} as const satisfies ThemeCore;

const BLOOM = {
  scheme: "dark",
  canvas: "#100c14",
  panel: "#18141e",
  track: "#221c2a",
  line: "#3a3048",
  edge: "#6a5878",
  fg: "#f0e8f4",
  body: "#d8d0dc",
  muted: "#a890b0",
  dim: "#8a7898",
  faint: "#5a5068",
  accent: "#d070c0",
  accentHover: "#e088d0",
  mark: "#f0c8e8",
  accentLine: "#884878",
  accentSoft: "#20141e",
  danger: "#e07090",
  dangerLine: "#a03858",
  dangerSoft: "#241018",
  ok: "#68b8a0",
  info: "#88a0d8",
} as const satisfies ThemeCore;

const PAPER = {
  scheme: "light",
  canvas: "#f6f1e8",
  panel: "#efe8dc",
  track: "#e4dccf",
  line: "#8e8270",
  edge: "#5a5248",
  fg: "#1c1814",
  body: "#2e2822",
  muted: "#524a42",
  dim: "#5c544c",
  faint: "#6e665c",
  accent: "#c24a28",
  accentHover: "#a83c1c",
  mark: "#8a2808",
  accentLine: "#a83818",
  accentSoft: "#f3d8cc",
  danger: "#b42858",
  dangerLine: "#8a1840",
  dangerSoft: "#f8dce6",
  ok: "#1a7a64",
  info: "#24608c",
} as const satisfies ThemeCore;

const CHALK = {
  scheme: "light",
  canvas: "#f2f5f8",
  panel: "#e6ecf2",
  track: "#d8e0e8",
  line: "#7a8a98",
  edge: "#4a5a68",
  fg: "#12161c",
  body: "#1e2630",
  muted: "#3a4856",
  dim: "#465462",
  faint: "#5a6876",
  accent: "#1e5a8c",
  accentHover: "#164a74",
  mark: "#0e3a60",
  accentLine: "#164a74",
  accentSoft: "#d0e0f0",
  danger: "#b42858",
  dangerLine: "#8a1840",
  dangerSoft: "#f4d8e4",
  ok: "#1a7060",
  info: "#24608c",
} as const satisfies ThemeCore;

const FOAM = {
  scheme: "light",
  canvas: "#eef6f5",
  panel: "#e0eeec",
  track: "#d0e4e0",
  line: "#5e8884",
  edge: "#3a5c58",
  fg: "#102018",
  body: "#1a2c2a",
  muted: "#345250",
  dim: "#425e5c",
  faint: "#547470",
  accent: "#0c6e68",
  accentHover: "#0a5c58",
  mark: "#064840",
  accentLine: "#0a5c58",
  accentSoft: "#c4e8e4",
  danger: "#b42858",
  dangerLine: "#8a1840",
  dangerSoft: "#f4d8e4",
  ok: "#1a7a64",
  info: "#24608c",
} as const satisfies ThemeCore;

const PETAL = {
  scheme: "light",
  canvas: "#f7f1f6",
  panel: "#efe4ee",
  track: "#e6d8e6",
  line: "#8e748e",
  edge: "#5a485a",
  fg: "#1a121c",
  body: "#2a2030",
  muted: "#4e3e56",
  dim: "#5a4a62",
  faint: "#6e5c76",
  accent: "#a02080",
  accentHover: "#881068",
  mark: "#6e0858",
  accentLine: "#881068",
  accentSoft: "#f4d0e8",
  danger: "#b42858",
  dangerLine: "#8a1840",
  dangerSoft: "#f8dce6",
  ok: "#1a7a64",
  info: "#3a508c",
} as const satisfies ThemeCore;

const INK = {
  scheme: "dark",
  canvas: "#050506",
  panel: "#141416",
  track: "#262628",
  line: "#6a6a70",
  edge: "#9a9aa0",
  fg: "#fafafa",
  body: "#e4e4e6",
  muted: "#b0b0b6",
  dim: "#c4c4ca",
  faint: "#8a8a92",
  accent: "#f0b020",
  accentHover: "#f8c040",
  mark: "#ffe08a",
  accentLine: "#c88810",
  accentSoft: "#2a220c",
  danger: "#f07090",
  dangerLine: "#c03858",
  dangerSoft: "#2a1018",
  ok: "#3cc8a8",
  info: "#7ab0e0",
} as const satisfies ThemeCore;

export const THEMES = [
  {
    id: "boom",
    label: "Boom",
    mood: "warm workshop — charcoal floor, rust-orange tools",
    tokens: { ...BOOM, you: "#3a1e16", kit: BOOM.track } satisfies ThemeTokens,
  },
  {
    id: "inlay",
    label: "Inlay",
    mood: "quiet forest — moss walls, cream inlay",
    tokens: { ...INLAY, you: "#2a2820", kit: INLAY.track } satisfies ThemeTokens,
  },
  {
    id: "lamp",
    label: "Lamp",
    mood: "lamplight at midnight — indigo walls, lime lamp",
    tokens: { ...LAMP, you: "#2a2a18", kit: LAMP.track } satisfies ThemeTokens,
  },
  {
    id: "noir",
    label: "Noir",
    mood: "Gotham night — steel sky, ice-blue trim",
    tokens: { ...NOIR, you: "#1a2430", kit: NOIR.track } satisfies ThemeTokens,
  },
  {
    id: "ember",
    label: "Ember",
    mood: "dying fire — blackened wood, coal-orange",
    tokens: { ...EMBER, you: "#2a1410", kit: EMBER.track } satisfies ThemeTokens,
  },
  {
    id: "tide",
    label: "Tide",
    mood: "night harbor — deep water, seafoam",
    tokens: { ...TIDE, you: "#142428", kit: TIDE.track } satisfies ThemeTokens,
  },
  {
    id: "bloom",
    label: "Bloom",
    mood: "dusk garden — violet dusk, magenta bloom",
    tokens: { ...BLOOM, you: "#241428", kit: BLOOM.track } satisfies ThemeTokens,
  },
  {
    id: "paper",
    label: "Paper",
    mood: "day workshop — cream paper, rust-orange tools",
    tokens: { ...PAPER, you: "#e4c4b0", kit: PAPER.track } satisfies ThemeTokens,
  },
  {
    id: "chalk",
    label: "Chalk",
    mood: "daylight Gotham — newsprint, steel-blue ink",
    tokens: { ...CHALK, you: "#c8d6e4", kit: CHALK.track } satisfies ThemeTokens,
  },
  {
    id: "foam",
    label: "Foam",
    mood: "noon harbor — salt white, seafoam",
    tokens: { ...FOAM, you: "#b8d8d4", kit: FOAM.track } satisfies ThemeTokens,
  },
  {
    id: "petal",
    label: "Petal",
    mood: "morning garden — pale lilac, magenta bloom",
    tokens: { ...PETAL, you: "#e4c0dc", kit: PETAL.track } satisfies ThemeTokens,
  },
  {
    id: "ink",
    label: "Ink",
    mood: "high-contrast night — black floor, white type, amber lamp",
    tokens: { ...INK, you: "#3a2410", kit: INK.track } satisfies ThemeTokens,
  },
] as const satisfies readonly ThemeDef[];

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "boom";

export type ThemeCard = {
  id: ThemeId;
  label: string;
  mood: string;
  canvas: string;
  accent: string;
};

const THEME_IDS: readonly string[] = THEMES.map((t) => t.id);

export function knownTheme(v: unknown): ThemeId | null {
  return typeof v === "string" && THEME_IDS.includes(v) ? (v as ThemeId) : null;
}

export function parseTheme(v: unknown): ThemeId {
  return knownTheme(v) ?? DEFAULT_THEME;
}

export function themeOf(id: ThemeId = DEFAULT_THEME) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** What the agent (and GET /api/theme) sees: id, mood, the two signature hexes. */
export function themeCards(): ThemeCard[] {
  return THEMES.map((t) => ({
    id: t.id,
    label: t.label,
    mood: t.mood,
    canvas: t.tokens.canvas,
    accent: t.tokens.accent,
  }));
}

export function themeIdList(): readonly string[] {
  return THEME_IDS;
}
