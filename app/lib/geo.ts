import { readGeo, type GeoResult } from "@/lib/phone/geo";

export function browserGeo(): Promise<GeoResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ ok: false, reason: "unavailable" });
  }
  return readGeo(navigator.geolocation);
}
