/** Chrome / iOS install surfaces. Manifest rules live in `pwa.ts`. */

export type DisplayMedia = {
  matchMedia(query: string): { matches: boolean };
};

export type StandaloneNav = {
  standalone?: boolean;
};

export type InstallChoice = {
  prompt: () => Promise<void>;
};

export const INSTALL_HINT_KEY = "pendant.install";

type Getter = { getItem(key: string): string | null };
type Setter = { setItem(key: string, value: string): void };

/** Default on. Only `"off"` hides the header Install hint. */
export function installHintOn(storage: Getter | null | undefined): boolean {
  return storage?.getItem(INSTALL_HINT_KEY) !== "off";
}

export function writeInstallHint(storage: Setter, on: boolean): void {
  storage.setItem(INSTALL_HINT_KEY, on ? "on" : "off");
}

type PromptEvent = Event & {
  prompt: () => Promise<unknown>;
};

export function isStandalone(
  media: { matchMedia?: DisplayMedia["matchMedia"] },
  nav: object,
): boolean {
  if (typeof media.matchMedia === "function") {
    if (media.matchMedia("(display-mode: standalone)").matches) {
      return true;
    }
    if (media.matchMedia("(display-mode: fullscreen)").matches) {
      return true;
    }
    if (media.matchMedia("(display-mode: minimal-ui)").matches) {
      return true;
    }
  }
  return "standalone" in nav && (nav as StandaloneNav).standalone === true;
}

export function isIos(nav: Pick<Navigator, "userAgent">): boolean {
  return /iPhone|iPad|iPod/i.test(nav.userAgent);
}

export function listenInstallPrompt(
  onChange: (choice: InstallChoice | null) => void,
  target: EventTarget,
): () => void {
  function onBefore(ev: Event) {
    const prompt = (ev as PromptEvent).prompt;
    if (typeof prompt !== "function") {
      return;
    }
    ev.preventDefault();
    onChange({
      prompt: async () => {
        await prompt.call(ev);
        onChange(null);
      },
    });
  }
  function onInstalled() {
    onChange(null);
  }
  target.addEventListener("beforeinstallprompt", onBefore);
  target.addEventListener("appinstalled", onInstalled);
  return () => {
    target.removeEventListener("beforeinstallprompt", onBefore);
    target.removeEventListener("appinstalled", onInstalled);
  };
}
