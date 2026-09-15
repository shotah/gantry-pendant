/** Browser permission state we can show in Settings. `prompt` includes "not queried yet". */

export type DevicePermission = "granted" | "denied" | "prompt" | "unsupported";

export function readDevicePermission(state: unknown): DevicePermission {
  if (state === "granted" || state === "denied" || state === "prompt") {
    return state;
  }
  return "unsupported";
}

export function blockedHint(permission: DevicePermission): string {
  if (permission === "unsupported") {
    return "Not available in this browser.";
  }
  if (permission === "denied") {
    return "Blocked — enable in system settings.";
  }
  return "";
}
