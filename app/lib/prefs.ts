import { geoPrefOn, writeGeoPref } from "@/lib/phone/prefs";

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
