import type { Geo, PhoneContext } from "../mailbox/frame";

export type GeoFix = {
  lat: number;
  lon: number;
  accuracy_m?: number;
  alt_m?: number;
  heading?: number;
  speed_mps?: number;
};

/** Build the wire context. Omit geo when the OS denied or failed. */
export function buildContext(opts: {
  now?: Date;
  timeZone?: string;
  geo?: GeoFix | null;
  battery?: { pct: number; charging: boolean } | null;
  net?: PhoneContext["net"];
  surface?: PhoneContext["surface"];
}): PhoneContext {
  const now = opts.now ?? new Date();
  const ctx: PhoneContext = {
    at: now.toISOString(),
    tz: opts.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    surface: opts.surface ?? "pendant",
  };
  if (opts.geo) {
    ctx.geo = opts.geo as Geo;
  }
  if (opts.battery) {
    ctx.battery = opts.battery;
  }
  if (opts.net) {
    ctx.net = opts.net;
  }
  return ctx;
}

export function geoFromPosition(pos: {
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    altitude?: number | null;
    heading?: number | null;
    speed?: number | null;
  };
}): GeoFix {
  const c = pos.coords;
  const geo: GeoFix = { lat: c.latitude, lon: c.longitude };
  if (typeof c.accuracy === "number" && Number.isFinite(c.accuracy)) {
    geo.accuracy_m = c.accuracy;
  }
  if (typeof c.altitude === "number" && Number.isFinite(c.altitude)) {
    geo.alt_m = c.altitude;
  }
  if (typeof c.heading === "number" && Number.isFinite(c.heading) && c.heading >= 0) {
    geo.heading = c.heading;
  }
  if (typeof c.speed === "number" && Number.isFinite(c.speed) && c.speed >= 0) {
    geo.speed_mps = c.speed;
  }
  return geo;
}
