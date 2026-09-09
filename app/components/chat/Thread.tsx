"use client";

import type { ReactNode } from "react";
import { MarkdownBody } from "./MarkdownBody";

export type ChatBubble = {
  id: string;
  from: "you" | "kit";
  text: string;
  kind?: string;
  at: number;
  photo?: string;
  pending?: boolean;
};

/** Flushed inbound is your mouth; everything else follows the viewer role. */
export function bubbleFrom(viewerIsPhone: boolean, kind?: string): ChatBubble["from"] {
  if (viewerIsPhone && kind === "inbound") {
    return "you";
  }
  return viewerIsPhone ? "kit" : "you";
}

export function Thread({ messages, empty }: { messages: ChatBubble[]; empty?: ReactNode }) {
  if (!messages.length) {
    return empty ?? (
      <p className="px-4 py-8 text-center text-chat text-dim">
        Nothing yet. Type below — the other side of this room hears it.
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-2 px-3 py-4">
      {messages.map((m) => {
        const mine = m.from === "you";
        return (
          <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl border px-3 py-2 text-chat leading-relaxed ${
                mine
                  ? "border-accent-line bg-you text-fg"
                  : "border-line bg-kit text-body shadow-sm"
              }`}
            >
              {m.kind === "push"
                ? <p className="mb-1 text-[0.7em] uppercase tracking-wide text-dim">ping</p>
                : null}
              {m.photo
                ? <img src={m.photo} alt="" className="mb-2 max-h-48 rounded-lg" />
                : null}
              {m.text
                ? (
                    <div className={m.kind === "draft" ? "italic text-dim" : undefined}>
                      <MarkdownBody text={m.text} />
                    </div>
                  )
                : null}
              {mine && m.pending
                ? <p className="mt-1 text-[0.7em] text-dim">sending</p>
                : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
