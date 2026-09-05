/** `sub:email` or bare `sub`. Email is a label; `sub` is the key. */

export type AllowedHuman = { sub: string; email?: string };

export function parseAllowlist(raw: string | undefined): AllowedHuman[] {
  if (!raw?.trim()) {
    return [];
  }
  const out: AllowedHuman[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,\s]+/)) {
    const bit = part.trim();
    if (!bit) {
      continue;
    }
    const colon = bit.indexOf(":");
    const sub = (colon >= 0 ? bit.slice(0, colon) : bit).trim();
    const email = colon >= 0 ? bit.slice(colon + 1).trim() : "";
    if (!sub || seen.has(sub)) {
      continue;
    }
    seen.add(sub);
    out.push(email ? { sub, email } : { sub });
  }
  return out;
}

export function allowlistMap(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const h of parseAllowlist(raw)) {
    map.set(h.sub, h.email ?? "");
  }
  return map;
}

export function isAllowed(map: Map<string, string>, sub: string): boolean {
  return map.has(sub);
}
