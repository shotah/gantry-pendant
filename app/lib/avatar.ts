import { acceptJpeg } from "@/lib/avatar/jpeg";
import { avatarRequestPath } from "@/lib/avatar/http";
import { jpegFromFile } from "./jpegFromFile";

export async function uploadAvatarFile(opts: {
  slug: string;
  file: File;
  secret?: string;
  bearer?: string;
}): Promise<{ ok: true; rev: number } | { ok: false; error: string }> {
  let jpeg: Blob;
  try {
    jpeg = await jpegFromFile(opts.file);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "could not read that image" };
  }
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  const check = acceptJpeg(bytes);
  if (!check.ok) {
    return { ok: false, error: check.detail };
  }
  const body = new FormData();
  body.append("file", jpeg, "avatar.jpg");
  try {
    const res = await fetch(avatarRequestPath({
      slug: opts.slug,
      secret: opts.secret,
      bearer: opts.bearer,
    }), { method: "POST", body, credentials: "include" });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; rev?: number; error?: string; detail?: string };
    if (!res.ok || !data.ok || typeof data.rev !== "number") {
      return { ok: false, error: data.detail || data.error || res.statusText || "upload failed" };
    }
    return { ok: true, rev: data.rev };
  } catch {
    return { ok: false, error: "upload failed" };
  }
}
