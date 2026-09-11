"use client";

import { useEffect, useId, useRef, useState } from "react";
import { applyTheme, DEFAULT_THEME, parseTheme, THEME_KEY, THEMES, themeOf, type ThemeId } from "@/app/lib/theme";

function ThemeDot({ canvas, accent, line }: { canvas: string; accent: string; line: string }) {
  return (
    <span
      data-theme-swatch
      className="inline-flex h-3 w-3 shrink-0 overflow-hidden rounded-full border"
      style={{ borderColor: line }}
      aria-hidden
    >
      <span className="h-full w-1/2" style={{ backgroundColor: canvas }} />
      <span className="h-full w-1/2" style={{ backgroundColor: accent }} />
    </span>
  );
}

export function ThemeSelect({ onHumanPick }: { onHumanPick?: () => void }) {
  const [id, setId] = useState<ThemeId>(DEFAULT_THEME);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = themeOf(id);

  useEffect(() => {
    function sync() {
      setId(parseTheme(document.documentElement.getAttribute("data-theme")));
    }
    function onStorage(e: StorageEvent) {
      if (e.key && e.key !== THEME_KEY) {
        return;
      }
      const next = parseTheme(e.newValue ?? localStorage.getItem(THEME_KEY));
      applyTheme(next);
      setId(next);
    }
    sync();
    window.addEventListener("pendant-theme", sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("pendant-theme", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointer(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(next: ThemeId) {
    onHumanPick?.();
    setId(next);
    applyTheme(next);
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <span ref={root} className="relative block">
      <button
        ref={trigger}
        type="button"
        aria-label="color theme"
        title={current.mood}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className="inline-flex w-full items-center gap-1.5 rounded border border-line bg-canvas px-1.5 py-0.5 text-xs text-body"
        onClick={() => setOpen((v) => !v)}
      >
        <ThemeDot canvas={current.tokens.canvas} accent={current.tokens.accent} line={current.tokens.line} />
        <span className="min-w-0 truncate">{current.label}</span>
      </button>
      {open
        ? (
            <span
              id={listId}
              role="listbox"
              className="absolute inset-x-0 z-50 mt-1 rounded border border-line bg-panel py-1 shadow-lg"
            >
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="option"
                  aria-selected={t.id === id}
                  title={t.mood}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-body hover:bg-track ${t.id === id ? "bg-track" : ""}`}
                  onClick={() => pick(t.id)}
                >
                  <ThemeDot canvas={t.tokens.canvas} accent={t.tokens.accent} line={t.tokens.line} />
                  <span className="min-w-0 truncate">{t.label}</span>
                </button>
              ))}
            </span>
          )
        : null}
    </span>
  );
}
