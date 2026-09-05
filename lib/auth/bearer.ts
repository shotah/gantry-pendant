import { secretEqual } from "./secret";

/** `kit:token,ada:token2` — one bearer per crane slug. */

export function parseBearers(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw?.trim()) {
    return map;
  }
  for (const part of raw.split(",")) {
    const bit = part.trim();
    const colon = bit.indexOf(":");
    if (colon < 1) {
      continue;
    }
    const slug = bit.slice(0, colon).trim().toLowerCase();
    const token = bit.slice(colon + 1);
    if (slug && token) {
      map.set(slug, token);
    }
  }
  return map;
}

export function bearerForSlug(map: Map<string, string>, slug: string, presented: string): boolean {
  const want = map.get(slug);
  if (!want) {
    return false;
  }
  return secretEqual(want, presented);
}
