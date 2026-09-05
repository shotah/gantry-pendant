"use client";

import { useRef, useState } from "react";

export function Compose({
  disabled,
  placeholder,
  onSend,
  onPhoto,
  gpsHint,
}: {
  disabled?: boolean;
  placeholder?: string;
  onSend: (text: string) => void;
  onPhoto?: (file: File) => void;
  gpsHint?: string;
}) {
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || disabled) {
      return;
    }
    onSend(t);
    setText("");
  }

  return (
    <form onSubmit={submit} className="border-t border-line bg-panel p-3">
      {gpsHint
        ? <p className="mb-2 text-[11px] text-dim">{gpsHint}</p>
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
        <textarea
          className="min-h-11 flex-1 resize-none rounded-xl border border-edge bg-canvas px-3 py-2 text-sm text-fg"
          rows={2}
          value={text}
          placeholder={placeholder ?? "Message"}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
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
