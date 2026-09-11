import type { PhotoSizeId } from "@/lib/phone/photo";
import { geoPrefOn, photoSizePref, writeGeoPref, writePhotoSizePref } from "@/lib/phone/prefs";

export function browserGeoPref(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return geoPrefOn(window.localStorage);
}

export function saveGeoPref(on: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  writeGeoPref(window.localStorage, on);
}

export function browserPhotoSizePref(): PhotoSizeId {
  if (typeof window === "undefined") {
    return photoSizePref(null);
  }
  return photoSizePref(window.localStorage);
}

export function savePhotoSizePref(id: PhotoSizeId): void {
  if (typeof window === "undefined") {
    return;
  }
  writePhotoSizePref(window.localStorage, id);
}
