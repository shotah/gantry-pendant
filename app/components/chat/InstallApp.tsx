"use client";

import { useEffect, useState } from "react";
import { isIos, isStandalone, listenInstallPrompt, type InstallChoice } from "@/app/lib/install";

export function InstallApp({ placement }: { placement: "header" | "block" }) {
  const [choice, setChoice] = useState<InstallChoice | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone(window, navigator));
    setIos(isIos(navigator));
    return listenInstallPrompt(setChoice, window);
  }, []);

  if (standalone) {
    return null;
  }

  if (placement === "header") {
    if (!choice) {
      return null;
    }
    return (
      <button
        type="button"
        className="ml-auto shrink-0 text-xs text-mark underline"
        onClick={() => void choice.prompt()}
      >
        Install
      </button>
    );
  }

  if (choice) {
    return (
      <button
        type="button"
        className="rounded-xl border border-accent-line bg-accent-soft px-4 py-2 text-sm text-mark"
        onClick={() => void choice.prompt()}
      >
        Install app
      </button>
    );
  }

  return (
    <p className="text-xs text-dim">
      {ios
        ? "Share → Add to Home Screen"
        : "Chrome menu → Cast, save and share → Install pendant"}
    </p>
  );
}
