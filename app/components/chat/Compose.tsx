"use client";

import { useId, useMemo, useRef, useState } from "react";
import { matchSlash, slashInsert, slashToken, type SlashCommand } from "@/app/lib/slash";

export function Compose({
  disabled,
  placeholder,
  onSend,
  onPhoto,
  gpsHint,
  commands,
  catalog = [],
  initialText = "",
}: {
  disabled?: boolean;
  placeholder?: string;
  onSend: (text: string) => void;
  onPhoto?: (file: File) => void;
  gpsHint?: string;
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
      {gpsHint
        ? <p className="mb-2 text-[11px] text-dim">{gpsHint}</p>
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
      <div className="flex items-end gap-2">
        {onPhoto
          ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      onPhoto(f);
                    }
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="rounded border border-line px-2 text-sm text-muted"
                  onClick={() => fileRef.current?.click()}
                  disabled={disabled}
                >
                  photo
                </button>
              </>
            )
          : null}
        {commands
          ? (
              <button
                type="button"
                className="rounded border border-line px-2 text-sm text-muted"
                aria-label="harness commands"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                title="Harness commands"
                disabled={disabled}
                onClick={toggleCommands}
              >
                /
              </button>
            )
          : null}
        <textarea
          ref={boxRef}
          className="min-h-11 flex-1 resize-none rounded-xl border border-edge bg-canvas px-3 py-2 text-sm text-fg"
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
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="rounded-xl border border-accent-line bg-accent-soft px-3 py-2 text-sm text-mark disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </form>
  );
}
