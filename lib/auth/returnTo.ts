import { parseSlug } from "../mailbox/slug";

/** After Google: `/` or `/?slug=<slug>`. Anything else is `/`. */
export function parseGoogleNext(raw: string | null | undefined): string {
  if (!raw) {
    return "/";
  }
  const trimmed = raw.trim();
  if (trimmed === "/") {
    return "/";
  }
  if (trimmed.length > 64) {
    return "/";
  }
  const m = /^\/\?slug=([a-zA-Z0-9-]+)$/.exec(trimmed);
  const slug = m?.[1] ? parseSlug(m[1]) : null;
  return slug ? `/?slug=${slug}` : "/";
}

export function googleReturnTo(slug?: string | null): string {
  const s = slug ? parseSlug(slug) : null;
  return s ? `/?slug=${s}` : "/";
}

export function googleStartHref(slug?: string | null): string {
  const next = googleReturnTo(slug);
  if (next === "/") {
    return "/api/auth/google";
  }
  return `/api/auth/google?next=${encodeURIComponent(next)}`;
}

export function googleCallbackLocation(next?: string): string {
  return parseGoogleNext(next);
}
