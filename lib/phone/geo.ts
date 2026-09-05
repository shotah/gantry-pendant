import { geoFromPosition, type GeoFix } from "./context";

export type GeoResult = { ok: true; geo: GeoFix } | { ok: false; reason: "denied" | "unavailable" };

type GeoApi = {
  getCurrentPosition: (
    success: (pos: GeolocationPosition) => void,
    error?: (err: GeolocationPositionError) => void,
    opts?: PositionOptions,
  ) => void;
};

/** One-shot fix on send. Denied or missing API → omit geo. Never watchPosition. */
export function readGeo(api: GeoApi | null | undefined, timeoutMs = 8_000): Promise<GeoResult> {
  if (!api) {
    return Promise.resolve({ ok: false, reason: "unavailable" });
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, reason: "unavailable" }), timeoutMs);
    try {
      api.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          resolve({ ok: true, geo: geoFromPosition(pos) });
        },
        (err) => {
          clearTimeout(timer);
          resolve({ ok: false, reason: err.code === 1 ? "denied" : "unavailable" });
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
      );
    } catch {
      clearTimeout(timer);
      resolve({ ok: false, reason: "unavailable" });
    }
  });
}
