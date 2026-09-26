import { describe, expect, it } from "vitest";
import { parseFrame } from "@/lib/mailbox/frame";
import {
  ageLabel,
  cleanTodoText,
  cranePublishedTodo,
  parseTodoBoard,
  parseTodoFrame,
  phoneMustNotPublishTodo,
  TODO_MAX,
  todoDoneCommand,
  todoStoreKey,
} from "@/lib/mailbox/todo";

const dentist = { id: 412, slug: "dentist", text: "call to book a cleaning", at: "2026-09-23" };
const passport = { id: 418, slug: "passport", text: "renew, by Oct 15", at: "2026-09-26" };

describe("parseTodoBoard", () => {
  it("keeps the crane's rows in order and drops a bad row, not the list", () => {
    expect(parseTodoBoard([
      dentist,
      { id: 0, slug: "zero", text: "no id", at: "2026-09-26" },
      { id: 1.5, slug: "frac", text: "float id", at: "2026-09-26" },
      { id: 413, slug: "Bad Slug", text: "spaces", at: "2026-09-26" },
      { id: 414, slug: "empty", text: "   ", at: "2026-09-26" },
      { id: 415, slug: "no-text" },
      "junk",
      null,
      passport,
    ])).toEqual([dentist, passport]);
  });

  it("collapses whitespace, clips to 240 runes, lowercases the slug, and tolerates a missing date", () => {
    const rows = parseTodoBoard([
      { id: 1, slug: "Amazon", text: "  return\n\nthe   box  ", at: "nope" },
      { id: 2, slug: "long", text: "🙂".repeat(300) },
    ]);
    expect(rows[0]).toEqual({ id: 1, slug: "amazon", text: "return the box", at: "" });
    expect(Array.from(rows[1]?.text ?? "")).toHaveLength(240);
    expect(cleanTodoText(42)).toBe("");
  });

  it("drops a repeated id or slug — the slug is the identity", () => {
    expect(parseTodoBoard([dentist, { ...dentist, id: 999 }, { ...passport, id: 412 }])).toEqual([dentist]);
  });

  it("caps at the phone's tolerance and treats junk as an empty list", () => {
    const many = Array.from({ length: TODO_MAX + 5 }, (_, i) => ({ id: i + 1, slug: `t${i}`, text: `task ${i}`, at: "2026-09-26" }));
    expect(parseTodoBoard(many)).toHaveLength(TODO_MAX);
    expect(parseTodoBoard(undefined)).toEqual([]);
    expect(parseTodoBoard({ todo: [dentist] })).toEqual([]);
  });

  it("is what parseFrame hangs on a todo frame", () => {
    expect(parseTodoFrame({ kind: "todo", todo: [dentist] })).toEqual([dentist]);
    const parsed = parseFrame(JSON.stringify({ kind: "todo", todo: [dentist, { id: "x" }] }));
    expect(parsed.ok && parsed.frame).toEqual({ kind: "todo", todo: [dentist] });
    const empty = parseFrame(JSON.stringify({ kind: "todo", todo: [] }));
    expect(empty.ok && empty.frame).toEqual({ kind: "todo", todo: [] });
  });
});

describe("todo helpers", () => {
  it("gates by role, keys the store by owner, and spells the one write", () => {
    expect(phoneMustNotPublishTodo("phone", "todo")).toBe(true);
    expect(phoneMustNotPublishTodo("crane", "todo")).toBe(false);
    expect(cranePublishedTodo("crane", "todo")).toBe(true);
    expect(cranePublishedTodo("phone", "todo")).toBe(false);
    expect(todoStoreKey()).toBe("todo");
    expect(todoStoreKey("  ")).toBe("todo");
    expect(todoStoreKey("1182")).toBe("todo:1182");
    expect(todoDoneCommand(412)).toBe("/todo done 412");
  });

  it("ages after the first day, says nothing today, on junk, or in the future", () => {
    const now = new Date(2026, 8, 26, 15, 0, 0);
    expect(ageLabel("2026-09-26", now)).toBe("");
    expect(ageLabel("2026-09-25", now)).toBe("1d ago");
    expect(ageLabel("2026-09-17", now)).toBe("9d ago");
    expect(ageLabel("2026-09-27", now)).toBe("");
    expect(ageLabel("", now)).toBe("");
    expect(ageLabel("2026-13-40", now)).toBe("");
  });
});
