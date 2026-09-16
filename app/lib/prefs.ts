import type { LangId } from "@/lib/phone/lang";
import type { PhotoSizeId } from "@/lib/phone/photo";
import {
  backdropPrefOn,
  followThemePrefOn,
  geoPrefOn,
  langPref,
  photoSizePref,
  voicePrefOn,
  writeBackdropPref,
  writeFollowThemePref,
  writeGeoPref,
  writeLangPref,
  writePhotoSizePref,
  writeVoicePref,
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

export function browserVoicePref(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return voicePrefOn(window.localStorage);
}

export function saveVoicePref(on: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  writeVoicePref(window.localStorage, on);
}

export function browserLangPref(): LangId {
  if (typeof window === "undefined") {
    return langPref(null);
  }
  return langPref(window.localStorage);
}

export function saveLangPref(id: LangId): void {
  if (typeof window === "undefined") {
    return;
  }
  writeLangPref(window.localStorage, id);
}
