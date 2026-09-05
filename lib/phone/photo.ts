import { IMAGE_BYTES_MAX } from "../mailbox/caps";

export type PhotoOk = { ok: true; url: string };
export type PhotoErr = { ok: false; error: "too large" | "bad photo" };
export type PhotoResult = PhotoOk | PhotoErr;

const ALLOWED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export function photoDataUrl(opts: { mime: string; bytes: Uint8Array }): PhotoResult {
  const mime = opts.mime.toLowerCase() === "image/jpg" ? "image/jpeg" : opts.mime.toLowerCase();
  if (!ALLOWED.has(mime)) {
    return { ok: false, error: "bad photo" };
  }
  if (opts.bytes.byteLength === 0 || opts.bytes.byteLength > IMAGE_BYTES_MAX) {
    return { ok: false, error: opts.bytes.byteLength === 0 ? "bad photo" : "too large" };
  }
  const b64 = bytesToB64(opts.bytes);
  return { ok: true, url: `data:${mime};base64,${b64}` };
}

export function parsePhotoFile(file: { type: string; size: number }): PhotoErr | { ok: true } {
  const mime = file.type.toLowerCase();
  if (!ALLOWED.has(mime)) {
    return { ok: false, error: "bad photo" };
  }
  if (file.size <= 0 || file.size > IMAGE_BYTES_MAX) {
    return { ok: false, error: file.size <= 0 ? "bad photo" : "too large" };
  }
  return { ok: true };
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin);
}
