import { IMAGE_BYTES_MAX } from "@/lib/mailbox/caps";
import { CHAT_PHOTO_EDGE, photoDataUrl, type PhotoResult } from "@/lib/phone/photo";
import { jpegFromFile } from "./jpegFromFile";

export async function fileToPhoto(file: File): Promise<PhotoResult> {
  if (file.size <= 0) {
    return { ok: false, error: "bad photo" };
  }
  try {
    const blob = await jpegFromFile(file, { edge: CHAT_PHOTO_EDGE, maxBytes: IMAGE_BYTES_MAX });
    const buf = new Uint8Array(await blob.arrayBuffer());
    return photoDataUrl({ mime: "image/jpeg", bytes: buf });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("too large")) {
      return { ok: false, error: "too large" };
    }
    return { ok: false, error: "bad photo" };
  }
}
