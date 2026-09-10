import { IMAGE_BYTES_MAX } from "@/lib/mailbox/caps";
import { CHAT_PHOTO_EDGE, photoDataUrl, type PhotoResult } from "@/lib/phone/photo";
import { jpegFromFile } from "./jpegFromFile";

export type ClipboardBits = {
  items?: ArrayLike<{ kind: string; type: string; getAsFile: () => File | null }>;
  files?: ArrayLike<File>;
};

function isImageFile(file: File | null): file is File {
  return Boolean(file && file.size > 0 && file.type.toLowerCase().startsWith("image/"));
}

export function fileFromClipboard(data: ClipboardBits | null | undefined): File | null {
  if (!data) {
    return null;
  }
  const items = data.items;
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== "file") {
        continue;
      }
      const file = item.getAsFile();
      if (isImageFile(file)) {
        return file;
      }
    }
  }
  const files = data.files;
  if (files) {
    for (let i = 0; i < files.length; i++) {
      if (isImageFile(files[i])) {
        return files[i];
      }
    }
  }
  return null;
}

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
