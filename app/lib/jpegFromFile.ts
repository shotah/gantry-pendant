import { AVATAR_EDGE, AVATAR_MAX_BYTES, shouldPassthroughJpeg } from "@/lib/avatar/jpeg";

/** Browser canvas → JPEG, same as gantree `app/lib/jpegFromFile.ts`. */
export async function jpegFromFile(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("could not read that image");
  }
  try {
    if (shouldPassthroughJpeg({
      type: file.type,
      size: file.size,
      width: bitmap.width,
      height: bitmap.height,
    })) {
      return file;
    }
    const scale = Math.min(1, AVATAR_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("could not encode jpeg");
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob || blob.size > AVATAR_MAX_BYTES) {
      throw new Error(blob ? "image too large (max 5MB)" : "could not encode jpeg");
    }
    return blob;
  } finally {
    bitmap.close();
  }
}
