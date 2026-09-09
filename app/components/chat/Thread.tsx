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

export function Thread({ messages, empty }: { messages: ChatBubble[]; empty?: ReactNode }) {
  if (!messages.length) {
    return empty ?? (
      <p className="px-4 py-8 text-center text-sm text-dim">
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
              className={`max-w-[85%] rounded-2xl border px-3 py-2 text-sm leading-relaxed ${
                mine
                  ? "border-accent-line bg-you text-fg"
                  : "border-line bg-kit text-body shadow-sm"
              }`}
            >
              {m.kind === "push"
                ? <p className="mb-1 text-[10px] uppercase tracking-wide text-dim">ping</p>
                : null}
              {m.photo
                ? <img src={m.photo} alt="" className="mb-2 max-h-48 rounded-lg" />
                : null}
              {m.text ? <MarkdownBody text={m.text} /> : null}
              {mine && m.pending
                ? <p className="mt-1 text-[10px] text-dim">sending</p>
                : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
