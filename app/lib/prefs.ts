import type { PhotoSizeId } from "@/lib/phone/photo";
import {
  backdropPrefOn,
  followThemePrefOn,
  geoPrefOn,
  photoSizePref,
  writeBackdropPref,
  writeFollowThemePref,
  writeGeoPref,
  writePhotoSizePref,
} from "@/lib/phone/prefs";

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

export function browserBackdropPref(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return backdropPrefOn(window.localStorage);
}

export function saveBackdropPref(on: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  writeBackdropPref(window.localStorage, on);
}

export function browserFollowThemePref(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return followThemePrefOn(window.localStorage);
}

export function saveFollowThemePref(on: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  writeFollowThemePref(window.localStorage, on);
}
