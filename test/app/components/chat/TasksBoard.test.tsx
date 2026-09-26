/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { metaLine, TasksButton, TasksSheet, TODO_LONG } from "@/app/components/chat/TasksBoard";
import { SAMPLE_TODO } from "@/lib/dev/samples";

afterEach(() => {
  cleanup();
});

describe("TasksButton", () => {
  it("is nothing on an empty list; the badge is unseen changes, not the list size", () => {
    const { container, rerender } = render(<TasksButton count={0} changes={0} open={false} onToggle={() => {}} />);
    expect(container.innerHTML).toBe("");
    const onToggle = vi.fn();
    rerender(<TasksButton count={3} changes={0} open={false} onToggle={onToggle} />);
    const quiet = screen.getByRole("button", { name: "tasks" });
    expect(quiet.textContent).toBe("");
    fireEvent.click(quiet);
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(<TasksButton count={3} changes={2} open={false} onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "tasks (2 changed)" }).textContent).toBe("2");
  });
});

describe("TasksSheet", () => {
  it("lists every task oldest first with its id, slug, and age; the checkbox sends /todo done and stays open", () => {
    const onDone = vi.fn();
    const onClose = vi.fn();
    render(<TasksSheet todo={SAMPLE_TODO} onClose={onClose} onDone={onDone} onSend={() => {}} />);
    const rows = screen.getByRole("list", { name: "open tasks" }).querySelectorAll("li");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain("return the box");
    expect(rows[0]?.textContent).toContain("#420 · amazon · ");
    expect(rows[0]?.textContent).toMatch(/\d+d ago/u);

    const box = screen.getByRole("checkbox", { name: "done: call to book a cleaning" });
    expect(box.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(box);
    expect(onDone).toHaveBeenCalledWith(412);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("paints a pending row ticked and struck through, and will not send it twice", () => {
    const onDone = vi.fn();
    render(<TasksSheet todo={SAMPLE_TODO} pending={[412]} onClose={() => {}} onDone={onDone} onSend={() => {}} />);
    const box = screen.getByRole("checkbox", { name: "done: call to book a cleaning" });
    expect(box.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(box);
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByText("call to book a cleaning").className).toContain("line-through");
    expect(screen.getByText("return the box").className).not.toContain("line-through");
  });

  it("adds in the human's words as plain text to Kit, and Full list is /todo; both close the sheet", () => {
    const onSend = vi.fn();
    const onClose = vi.fn();
    render(<TasksSheet todo={SAMPLE_TODO} onClose={onClose} onDone={() => {}} onSend={onSend} />);
    const add = screen.getByRole("button", { name: "Add" });
    expect(add).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByRole("textbox", { name: "New task" }), { target: { value: "  pick up   the dry cleaning " } });
    expect(add).toHaveProperty("disabled", false);
    fireEvent.click(add);
    expect(onSend).toHaveBeenCalledWith("add to my list: pick up the dry cleaning");
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Full list" }));
    expect(onSend).toHaveBeenLastCalledWith("/todo");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("says so past the pocket-list line, says nothing on an empty list, and closes on Escape or the scrim", () => {
    const onClose = vi.fn();
    const many = Array.from({ length: TODO_LONG + 1 }, (_, i) => ({ id: i + 1, slug: `t${i}`, text: `task ${i}`, at: "2026-09-26" }));
    const { rerender } = render(<TasksSheet todo={many} onClose={onClose} onDone={() => {}} onSend={() => {}} />);
    expect(screen.getByText(`${TODO_LONG + 1} open — a pocket list; prune, or use a tracker.`)).toBeTruthy();
    rerender(<TasksSheet todo={[]} onClose={onClose} onDone={() => {}} onSend={() => {}} />);
    expect(screen.getByText("Nothing on the list.")).toBeTruthy();
    expect(screen.queryByText(/pocket list;/u)).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByTestId("tasks-scrim"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("metaLine is #id · slug · age, with no age on the day it was written", () => {
    const now = new Date(2026, 8, 26, 12, 0, 0);
    expect(metaLine({ id: 418, slug: "passport", text: "renew", at: "2026-09-26" }, now)).toBe("#418 · passport");
    expect(metaLine({ id: 420, slug: "amazon", text: "return the box", at: "2026-09-17" }, now)).toBe("#420 · amazon · 9d ago");
  });
});
