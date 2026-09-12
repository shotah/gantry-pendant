import { parseSlug } from "../mailbox/slug";
import { headerSaysTooLarge } from "../mailbox/caps";
import { AVATAR_MAX_BYTES } from "./jpeg";

export type BlobRequestOpts = {
  slug: string;
  rev?: number;
  secret?: string;
  bearer?: string;
};

/** `/api/avatar?slug=kit` — relative, for same-origin fetch. */
export function avatarRequestPath(opts: BlobRequestOpts): string {
  return blobRequestPath("/api/avatar", opts);
}

/** Same query shape for every per-slug JPEG the Durable Object serves (face, backdrop). */
export function blobRequestPath(pathname: string, opts: BlobRequestOpts): string {
  const u = new URL(pathname, "http://pendant.local");
  u.searchParams.set("slug", opts.slug);
  if (opts.rev && opts.rev > 0) {
    u.searchParams.set("v", String(opts.rev));
  }
  if (opts.secret) {
    u.searchParams.set("secret", opts.secret);
  }
  if (opts.bearer) {
    u.searchParams.set("bearer", opts.bearer);
  }
  return `${u.pathname}${u.search}`;
}

/** Strong validator for a stored JPEG: the rev is the identity. */
export function blobEtag(rev: number): string {
  return `"${rev}"`;
}

/** `If-None-Match` names this rev (list, weak `W/`, or `*` all count). */
export function etagMatches(ifNoneMatch: string | null | undefined, etag: string): boolean {
  if (!ifNoneMatch) {
    return false;
  }
  return ifNoneMatch.split(",").some((raw) => {
    const tag = raw.trim();
    return tag === "*" || tag === etag || tag === `W/${etag}`;
  });
}

/** Forward the browser's validator to the Durable Object so it can answer 304. */
export function conditionalHeaders(req: Request): Record<string, string> {
  const tag = req.headers.get("If-None-Match");
  return tag ? { "If-None-Match": tag } : {};
}

/**
 * GET answer for a stored JPEG. A caller that already holds this rev (PWA
 * IndexedDB, browser cache) sends `If-None-Match` and gets an empty 304 instead
 * of the bytes; everyone else gets the JPEG. Same headers either way.
 */
export function blobResponse(hit: { jpeg: ArrayBuffer; rev: number }, ifNoneMatch: string | null): Response {
  const etag = blobEtag(hit.rev);
  const headers: Record<string, string> = {
    "X-Pendant-Rev": String(hit.rev),
    ETag: etag,
    "Cache-Control": "private, max-age=0, must-revalidate",
  };
  if (etagMatches(ifNoneMatch, etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(hit.jpeg, { headers: { ...headers, "Content-Type": "image/jpeg" } });
}

/**
 * Crane `.env` `PENDANT_MAILBOX_URL` (`wss://…/ws/kit`) → Worker face POST.
 * Same job as Telegram `setMyProfilePhoto`, different mouth.
 */
export function mailboxToAvatarUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol === "wss:") {
    u.protocol = "https:";
  } else if (u.protocol === "ws:") {
    u.protocol = "http:";
  } else if (u.protocol !== "http:" && u.protocol !== "https:") {
    return null;
  }
  const parts = u.pathname.split("/").filter(Boolean);
  const slug = parts[0] === "ws" ? parseSlug(parts[1] ?? "") : parseSlug(u.searchParams.get("slug") ?? "");
  if (!slug) {
    return null;
  }
  u.pathname = "/api/avatar";
  u.search = "";
  u.hash = "";
  u.searchParams.set("slug", slug);
  return u.toString();
}

export type UploadCap = { maxBytes: number; tooLarge: string };
export type UploadResult = { ok: true; bytes: Uint8Array } | { ok: false; detail: string };

const AVATAR_CAP: UploadCap = { maxBytes: AVATAR_MAX_BYTES, tooLarge: "image too large (max 5MB)" };

export async function readAvatarUpload(req: Request): Promise<UploadResult> {
  return readJpegUpload(req, AVATAR_CAP);
}

/** Raw body or multipart `file`, refused past `cap` before buffering when the length is declared. */
export async function readJpegUpload(req: Request, cap: UploadCap): Promise<UploadResult> {
  if (headerSaysTooLarge(req.headers.get("content-length"), cap.maxBytes)) {
    return { ok: false, detail: cap.tooLarge };
  }
  const ctype = (req.headers.get("content-type") ?? "").toLowerCase();
  if (ctype.includes("multipart/form-data")) {
    return fileFromForm(req, cap);
  }
  try {
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength > cap.maxBytes) {
      return { ok: false, detail: cap.tooLarge };
    }
    if (bytes.byteLength) {
      return { ok: true, bytes };
    }
  } catch {
    /* try form */
  }
  return fileFromForm(req, cap);
}

async function fileFromForm(req: Request, cap: UploadCap): Promise<UploadResult> {
  try {
    const form = await req.formData();
    const row = form.get("file");
    if (!(row instanceof Blob)) {
      return { ok: false, detail: "file required" };
    }
    if (row.size > cap.maxBytes) {
      return { ok: false, detail: cap.tooLarge };
    }
    const bytes = new Uint8Array(await row.arrayBuffer());
    if (bytes.byteLength > cap.maxBytes) {
      return { ok: false, detail: cap.tooLarge };
    }
    return { ok: true, bytes };
  } catch {
    return { ok: false, detail: "multipart file required" };
  }
}
