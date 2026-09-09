"use client";

import { useEffect, useState } from "react";
import { applyFont, DEFAULT_FONT, FONT_KEY, FONTS, parseFont, type FontId } from "@/app/lib/font";

export function FontSelect() {
  const [id, setId] = useState<FontId>(DEFAULT_FONT);

  useEffect(() => {
    function sync() {
      setId(parseFont(document.documentElement.getAttribute("data-font")));
    }
    function onStorage(e: StorageEvent) {
      if (e.key && e.key !== FONT_KEY) {
        return;
      }
      const next = parseFont(e.newValue ?? localStorage.getItem(FONT_KEY));
      applyFont(next);
      setId(next);
    }
    sync();
    window.addEventListener("pendant-font", sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("pendant-font", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function pick(next: FontId) {
    setId(next);
    applyFont(next);
  }

  return (
    <div role="radiogroup" aria-label="Font size" className="flex gap-1">
      {FONTS.map((f) => (
        <button
          key={f.id}
          type="button"
          role="radio"
          aria-checked={f.id === id}
          aria-label={f.label}
          title={f.label}
          className={`flex min-h-9 min-w-0 flex-1 items-center justify-center rounded border px-1 py-1.5 leading-none text-fg hover:bg-track ${
            f.id === id ? "border-accent-line bg-track" : "border-edge bg-canvas"
          }`}
          style={{ fontSize: f.size }}
          onClick={() => pick(f.id)}
        >
          Aa
        </button>
      ))}
    </div>
  );
}
