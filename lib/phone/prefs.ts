import { parsePhotoSize, type PhotoSizeId } from "./photo";

export const GEO_PREF_KEY = "pendant.geo";
export const PHOTO_PREF_KEY = "pendant.photo";

type Getter = { getItem(key: string): string | null };
type Setter = { setItem(key: string, value: string): void };

/** Default on. Only `"off"` disables the this-send pin. */
export function geoPrefOn(storage: Getter | null | undefined): boolean {
  return storage?.getItem(GEO_PREF_KEY) !== "off";
}

export function writeGeoPref(storage: Setter, on: boolean): void {
  storage.setItem(GEO_PREF_KEY, on ? "on" : "off");
}

/** Settings → Photo size. Junk or missing → `DEFAULT_PHOTO_SIZE`. */
export function photoSizePref(storage: Getter | null | undefined): PhotoSizeId {
  return parsePhotoSize(storage?.getItem(PHOTO_PREF_KEY));
}

export function writePhotoSizePref(storage: Setter, id: PhotoSizeId): void {
  storage.setItem(PHOTO_PREF_KEY, id);
}
