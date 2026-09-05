export const GEO_PREF_KEY = "pendant.geo";

type Getter = { getItem(key: string): string | null };
type Setter = { setItem(key: string, value: string): void };

/** Default on. Only `"off"` disables the this-send pin. */
export function geoPrefOn(storage: Getter | null | undefined): boolean {
  return storage?.getItem(GEO_PREF_KEY) !== "off";
}

export function writeGeoPref(storage: Setter, on: boolean): void {
  storage.setItem(GEO_PREF_KEY, on ? "on" : "off");
}
