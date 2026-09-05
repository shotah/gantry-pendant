import { parsePhotoFile, photoDataUrl, type PhotoResult } from "@/lib/phone/photo";

export async function fileToPhoto(file: File): Promise<PhotoResult> {
  const check = parsePhotoFile(file);
  if (!check.ok) {
    return check;
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  return photoDataUrl({ mime: file.type, bytes: buf });
}
