import type { AimRow } from "@/lib/mailbox/aims";

/**
 * What the human last looked at on the goals board, area → row. The
 * header badge is a call to action — it counts aims that differ from
 * this (new, changed, or gone), never the size of the board. Opening
 * the drawer marks the current board seen.
 */
export const AIMS_SEEN_KEY = "pendant.aimsSeen";

type Getter = { getItem(key: string): string | null };
type Setter = { setItem(key: string, value: string): void };

export type AimsSeen = Record<string, string>;

export function aimsFingerprint(aims: AimRow[]): AimsSeen {
  return Object.fromEntries(aims.map((a) => [a.area, JSON.stringify(a)]));
}

/** Aims that differ from what was last looked at: new, changed, or gone. */
export function changedAims(aims: AimRow[], seen: AimsSeen): number {
  const now = aimsFingerprint(aims);
  let n = 0;
  for (const area of new Set([...Object.keys(now), ...Object.keys(seen)])) {
    if (now[area] !== seen[area]) {
      n += 1;
    }
  }
  return n;
}

/** Junk or missing → nothing seen, so a first board counts whole. */
export function aimsSeenPref(storage: Getter | null | undefined): AimsSeen {
  const raw = storage?.getItem(AIMS_SEEN_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === "string"),
    );
  } catch {
    return {};
  }
}

export function writeAimsSeenPref(storage: Setter, aims: AimRow[]): AimsSeen {
  const seen = aimsFingerprint(aims);
  storage.setItem(AIMS_SEEN_KEY, JSON.stringify(seen));
  return seen;
}
