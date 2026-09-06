"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { matchSlash, slashInsert, slashToken, type SlashCommand } from "@/app/lib/slash";

function ClipIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.2 8.4l4.8-4.8a2.2 2.2 0 013.1 3.1L7.3 12.5a3.3 3.3 0 11-4.7-4.7l6.3-6.3"
      />
    </svg>
  );
}

function AttachChip({
  gpsOn,
  gpsHint,
  disabled,
  onPhoto,
  onCommands,
  onToggle,
  onPin,
}: {
  gpsOn: boolean;
  gpsHint?: string;
  disabled?: boolean;
  onPhoto?: () => void;
  onCommands?: () => void;
  onToggle?: () => void;
  onPin?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const menuId = useId();

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
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(fn?: () => void) {
    setOpen(false);
    fn?.();
  }

  return (
    <span ref={root} className="absolute right-1.5 top-1.5 z-10">
      <button
        type="button"
        aria-label="attach"
        title={gpsHint ?? "Attach"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-visible rounded-full p-0 text-muted"
        onClick={() => setOpen((v) => !v)}
      >
        <ClipIcon />
        {gpsOn
          ? <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />
          : null}
      </button>
      {open
        ? (
            <div
              id={menuId}
              role="dialog"
              aria-label="Attach"
              className="absolute right-0 bottom-full z-20 mb-1 w-52 rounded-xl border border-line bg-panel p-1.5 shadow-lg"
            >
              {onPhoto
                ? (
                    <button
                      type="button"
                      className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-body hover:bg-track disabled:opacity-40"
                      disabled={disabled}
                      onClick={() => pick(onPhoto)}
                    >
                      Photo
                    </button>
                  )
                : null}
              {onCommands
                ? (
                    <button
                      type="button"
                      aria-label="harness commands"
                      className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-body hover:bg-track disabled:opacity-40"
                      disabled={disabled}
                      onClick={() => pick(onCommands)}
                    >
                      Commands
                    </button>
                  )
                : null}
              {gpsHint
                ? <p className="px-2 py-1 text-[11px] text-dim">{gpsHint}</p>
                : null}
              {onToggle
                ? (
                    <button
                      type="button"
                      aria-pressed={gpsOn}
                      aria-label={gpsOn ? "GPS on" : "GPS off"}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-body hover:bg-track"
                      onClick={onToggle}
                    >
                      <span>GPS</span>
                      <span className={gpsOn ? "text-ok" : "text-muted"}>{gpsOn ? "on" : "off"}</span>
                    </button>
                  )
                : null}
              {onPin
                ? (
                    <button
                      type="button"
                      aria-label="drop pin"
                      className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-body hover:bg-track disabled:opacity-40"
                      disabled={disabled || !gpsOn}
                      onClick={onPin}
                    >
                      Drop a silent pin
                    </button>
                  )
                : null}
            </div>
          )
        : null}
    </span>
  );
}

export function Compose({
  disabled,
  placeholder,
  onSend,
  onPhoto,
  onPin,
  gpsHint,
  gpsOn = true,
  onGpsToggle,
  commands,
  catalog = [],
  initialText = "",
}: {
  disabled?: boolean;
  placeholder?: string;
  onSend: (text: string) => void;
  onPhoto?: (file: File) => void;
  onPin?: () => void;
  gpsHint?: string;
  gpsOn?: boolean;
  onGpsToggle?: () => void;
  commands?: boolean;
  catalog?: readonly SlashCommand[];
  initialText?: string;
}) {
  const [text, setText] = useState(initialText);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const matches = useMemo(() => (commands ? matchSlash(text, catalog) : []), [catalog, commands, text]);
  const waiting = Boolean(commands && catalog.length === 0 && slashToken(text) != null);
  const open = Boolean(commands && !disabled && !dismissed && (matches.length > 0 || waiting));
  const highlight = matches[Math.min(active, Math.max(0, matches.length - 1))];
  const attach = Boolean(onPhoto || commands || onGpsToggle || onPin);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#compose") {
      boxRef.current?.focus();
    }
  }, []);

  function setDraft(next: string) {
    setText(next);
    setDismissed(false);
    setActive(0);
  }

  function pick(cmd: SlashCommand) {
    setDraft(slashInsert(cmd));
    boxRef.current?.focus();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || disabled) {
      return;
    }
    onSend(t);
    setDraft("");
  }

  function toggleCommands() {
    if (open) {
      setDismissed(true);
      boxRef.current?.focus();
      return;
    }
    setDismissed(false);
    setActive(0);
    if (!text.startsWith("/") || /\s/.test(text)) {
      setText("/");
    }
    boxRef.current?.focus();
  }

  return (
    <form onSubmit={submit} className="relative border-t border-line bg-panel p-3">
      {onPhoto
        ? (
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  onPhoto(f);
                }
                e.target.value = "";
              }}
            />
          )
        : null}
      {open
        ? (
            <div
              id={listId}
              role="listbox"
              aria-label="Harness commands"
              className="absolute inset-x-3 bottom-full z-20 mb-1 max-h-64 overflow-y-auto rounded-xl border border-accent-line bg-panel shadow-lg"
            >
              <div className="border-b border-line px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-mark">Commands</p>
                <p className="text-[11px] text-dim">These go to the crane, not the chat model.</p>
              </div>
              {waiting
                ? <p className="px-3 py-2 text-xs text-muted">Waiting for the crane to publish commands.</p>
                : null}
              {matches.map((cmd, i) => {
                const selected = cmd === highlight;
                return (
                  <button
                    key={cmd.name}
                    type="button"
                    role="option"
                    aria-label={`/${cmd.name} ${cmd.hint}`}
                    aria-selected={selected}
                    className={`flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm ${
                      selected ? "bg-accent-soft" : "hover:bg-track"
                    }`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(cmd)}
                  >
                    <span className="shrink-0 font-medium text-mark">/{cmd.name}</span>
                    <span className="min-w-0 truncate text-xs text-muted">{cmd.hint}</span>
                  </button>
                );
              })}
            </div>
          )
        : null}
      <div className="flex items-center gap-2">
        <div className="relative min-h-11 min-w-0 flex-1">
          <textarea
            ref={boxRef}
            id="compose"
            className={`block min-h-11 w-full resize-none rounded-xl border border-edge bg-canvas px-3 py-2 text-sm text-fg ${attach ? "pr-9" : ""}`}
            rows={2}
            value={text}
            placeholder={placeholder ?? "Message"}
            disabled={disabled}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (open && highlight) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => (i + 1) % matches.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => (i - 1 + matches.length) % matches.length);
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  pick(highlight);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setDismissed(true);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(e);
              }
            }}
          />
          {attach
            ? (
                <AttachChip
                  gpsOn={Boolean(onGpsToggle || onPin) && gpsOn}
                  gpsHint={gpsHint}
                  disabled={disabled}
                  onPhoto={onPhoto ? () => fileRef.current?.click() : undefined}
                  onCommands={commands ? toggleCommands : undefined}
                  onToggle={onGpsToggle}
                  onPin={onPin}
                />
              )
            : null}
        </div>
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="shrink-0 rounded-xl border border-accent-line bg-accent-soft px-3 py-2 text-sm text-mark disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </form>
  );
}
