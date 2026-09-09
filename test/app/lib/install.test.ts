import { describe, expect, it, vi } from "vitest";
import {
  INSTALL_HINT_KEY,
  installHintOn,
  isIos,
  isStandalone,
  listenInstallPrompt,
  writeInstallHint,
} from "@/app/lib/install";

describe("install", () => {
  it("treats standalone display-mode as installed", () => {
    expect(isStandalone({ matchMedia: () => ({ matches: true }) }, {})).toBe(true);
    expect(isStandalone({
      matchMedia: (q) => ({ matches: q === "(display-mode: standalone)" }),
    }, {})).toBe(true);
    expect(isStandalone({ matchMedia: () => ({ matches: false }) }, { standalone: true })).toBe(true);
    expect(isStandalone({ matchMedia: () => ({ matches: false }) }, {})).toBe(false);
    expect(isStandalone({}, {})).toBe(false);
  });

  it("detects iOS from the UA", () => {
    expect(isIos({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" })).toBe(true);
    expect(isIos({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131" })).toBe(false);
  });

  it("stashes beforeinstallprompt and clears after prompt()", async () => {
    const target = new EventTarget();
    const onChange = vi.fn();
    const stop = listenInstallPrompt(onChange, target);
    const prompt = vi.fn().mockResolvedValue({ outcome: "accepted" });
    const ev = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(ev, { prompt });
    target.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    await onChange.mock.calls[0][0].prompt();
    expect(prompt).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenLastCalledWith(null);
    target.dispatchEvent(new Event("appinstalled"));
    expect(onChange).toHaveBeenLastCalledWith(null);
    stop();
  });

  it("defaults the header hint on and only treats off as dismissed", () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
    };
    expect(installHintOn(null)).toBe(true);
    expect(installHintOn(storage)).toBe(true);
    writeInstallHint(storage, false);
    expect(mem.get(INSTALL_HINT_KEY)).toBe("off");
    expect(installHintOn(storage)).toBe(false);
    writeInstallHint(storage, true);
    expect(installHintOn(storage)).toBe(true);
  });
});
