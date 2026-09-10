import { describe, expect, it } from "vitest";
import { buildContext, geoFromPosition } from "@/lib/phone/context";

describe("phone context", () => {
  it("always sends at + tz and only attaches granted geo", () => {
    const now = new Date("2026-09-04T20:00:00.000Z");
    const withGeo = buildContext({
      now,
      timeZone: "America/Los_Angeles",
      geo: { lat: 47.6, lon: -122.3, accuracy_m: 8 },
      net: "cellular",
      battery: { pct: 40, charging: true },
    });
    expect(withGeo.at).toBe("2026-09-04T20:00:00.000Z");
    expect(withGeo.tz).toBe("America/Los_Angeles");
    expect(withGeo.geo).toEqual({ lat: 47.6, lon: -122.3, accuracy_m: 8 });
    expect(withGeo.surface).toBe("pendant");
    const denied = buildContext({ now, timeZone: "UTC", geo: null, surface: "android_auto" });
    expect(denied.geo).toBeUndefined();
    expect(denied.surface).toBe("android_auto");
  });

  it("maps a GeolocationPosition-shaped fix", () => {
    expect(geoFromPosition({
      coords: {
        latitude: 1,
        longitude: 2,
        accuracy: 5,
        altitude: 10,
        heading: 180,
        speed: 0.5,
      },
    })).toEqual({
      lat: 1,
      lon: 2,
      accuracy_m: 5,
      alt_m: 10,
      heading: 180,
      speed_mps: 0.5,
    });
  });
});
