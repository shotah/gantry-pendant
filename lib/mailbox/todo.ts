import type { Role } from "./frame";

/**
 * The tasks board: the human's pocket list as one pushed snapshot (crane
 * `docs/tasks.md` §4.4; contract in docs/frontends.md → Tasks board).
 * Built the way `aims` is — the crane sends `{ kind: "todo", todo: [...] }`
 * on dial after `aims` and again whenever the list changed; the mailbox
 * keeps the latest and replays it on phone connect. An empty `todo` is a
 * real frame: the drawer clears.
 *
 * A task is one memory row (`fact` + `todo/<slug>`), so the id changes
 * when the words change and the slug is the identity. The phone's one
 * write is the checkbox: `/todo done <id>`.
 */

export const TODO_STORE_KEY = "todo";
/** The crane does not cap the frame (the stamp is what is capped). This is the phone's tolerance. */
export const TODO_MAX = 100;
export const TODO_SLUG_MAX = 32;
export const TODO_TEXT_MAX = 240;

export type TodoItem = {
  /** The memory row id — what `/todo done <id>` takes. Changes on rewrite. */
  id: number;
  /** The key after `todo/`; the noun the agent chose. Stable across rewrites. */
  slug: string;
  /** The action in the human's words; "by <when>" stays in here. */
  text: string;
  /** Local `YYYY-MM-DD` the row was last written. The phone shows the age. */
  at: string;
};

export function phoneMustNotPublishTodo(role: Role, kind?: string): boolean {
  return role === "phone" && kind === "todo";
}

export function cranePublishedTodo(role: Role, kind?: string): boolean {
  return role === "crane" && kind === "todo";
}

/** Room list when the crane names no human; that human's when it does. */
export function todoStoreKey(userId?: string): string {
  const owner = userId?.trim();
  return owner ? `${TODO_STORE_KEY}:${owner}` : TODO_STORE_KEY;
}

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Whitespace-collapsed, clipped to 240 runes, the way the crane sends it. */
export function cleanTodoText(raw: unknown): string {
  if (typeof raw !== "string") {
    return "";
  }
  return Array.from(raw.replace(/\s+/gu, " ").trim()).slice(0, TODO_TEXT_MAX).join("");
}

/** Untrusted wire → list rows, oldest first as sent. A bad row is dropped, not fatal; junk is an empty list. */
export function parseTodoBoard(raw: unknown): TodoItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: TodoItem[] = [];
  const ids = new Set<number>();
  const slugs = new Set<string>();
  for (const item of raw) {
    if (out.length >= TODO_MAX) {
      break;
    }
    if (!item || typeof item !== "object") {
      continue;
    }
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "number" && Number.isInteger(o.id) && o.id > 0 ? o.id : undefined;
    const slug = typeof o.slug === "string" ? o.slug.trim().toLowerCase() : "";
    const text = cleanTodoText(o.text);
    const at = typeof o.at === "string" && DAY_RE.test(o.at) ? o.at : "";
    if (id === undefined || !SLUG_RE.test(slug) || !text || ids.has(id) || slugs.has(slug)) {
      continue;
    }
    ids.add(id);
    slugs.add(slug);
    out.push({ id, slug, text, at });
  }
  return out;
}

/** The frame body from the wire. */
export function parseTodoFrame(o: Record<string, unknown>): TodoItem[] {
  return parseTodoBoard(o.todo);
}

/** The one kernel write the phone makes. */
export function todoDoneCommand(id: number): string {
  return `/todo done ${id}`;
}

function localDay(d: Date): number {
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);
}

/**
 * `9d ago` after the first day, nothing on the day it was written — the
 * same rule as the `[todo]` stamp. Junk or a future date says nothing.
 */
export function ageLabel(at: string, now: Date = new Date()): string {
  if (!DAY_RE.test(at)) {
    return "";
  }
  const then = new Date(`${at}T00:00:00`);
  if (Number.isNaN(then.getTime())) {
    return "";
  }
  const days = localDay(now) - localDay(then);
  return days >= 1 ? `${days}d ago` : "";
}
