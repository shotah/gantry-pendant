import { parseSlug } from "../mailbox/slug";
import { headerSaysTooLarge } from "../mailbox/caps";
import { AVATAR_MAX_BYTES } from "./jpeg";

/** `/api/avatar?slug=kit` — relative, for same-origin fetch. */
export function avatarRequestPath(opts: {
  slug: string;
  rev?: number;
  secret?: string;
  bearer?: string;
}): string {
  const u = new URL("/api/avatar", "http://pendant.local");
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

export async function readAvatarUpload(
  req: Request,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; detail: string }> {
  if (headerSaysTooLarge(req.headers.get("content-length"), AVATAR_MAX_BYTES)) {
    return { ok: false, detail: "image too large (max 5MB)" };
  }
  const ctype = (req.headers.get("content-type") ?? "").toLowerCase();
  if (ctype.includes("multipart/form-data")) {
    return fileFromForm(req);
  }
  try {
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength > AVATAR_MAX_BYTES) {
      return { ok: false, detail: "image too large (max 5MB)" };
    }
    if (bytes.byteLength) {
      return { ok: true, bytes };
    }
  } catch {
    /* try form */
  }
  return fileFromForm(req);
}

async function fileFromForm(
  req: Request,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; detail: string }> {
  try {
    const form = await req.formData();
    const row = form.get("file");
    if (!(row instanceof Blob)) {
      return { ok: false, detail: "file required" };
    }
    if (row.size > AVATAR_MAX_BYTES) {
      return { ok: false, detail: "image too large (max 5MB)" };
    }
    const bytes = new Uint8Array(await row.arrayBuffer());
    if (bytes.byteLength > AVATAR_MAX_BYTES) {
      return { ok: false, detail: "image too large (max 5MB)" };
    }
    return { ok: true, bytes };
  } catch {
    return { ok: false, detail: "multipart file required" };
  }
}
