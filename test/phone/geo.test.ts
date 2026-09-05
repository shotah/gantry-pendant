import { describe, expect, it } from "vitest";
import { geoHint, readGeo } from "@/lib/phone/geo";

describe("readGeo", () => {
  it("omits when the API is missing", async () => {
    expect(await readGeo(null)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("returns a fix on success and denied on permission error", async () => {
    const ok = await readGeo({
      getCurrentPosition(success) {
        success({
          coords: {
            latitude: 1,
            longitude: 2,
            accuracy: 3,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON() {
              return {};
            },
          },
          timestamp: 1,
          toJSON() {
            return {};
          },
        });
      },
    });
    expect(ok).toEqual({ ok: true, geo: { lat: 1, lon: 2, accuracy_m: 3 } });

    const denied = await readGeo({
      getCurrentPosition(_s, error) {
        error?.({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
      },
    });
    expect(denied).toEqual({ ok: false, reason: "denied" });
  });

  it("formats a compose hint", () => {
    expect(geoHint(false, null)).toBe("GPS off");
    expect(geoHint(true, { ok: false, reason: "denied" })).toBe("GPS omitted (denied or unavailable)");
    expect(geoHint(true, { ok: true, geo: { lat: 1, lon: 2, accuracy_m: 12.4 } })).toBe("pin ±12m this send");
  });
});
