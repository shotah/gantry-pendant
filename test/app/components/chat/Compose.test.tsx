/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Compose } from "@/app/components/chat/Compose";

afterEach(() => {
  cleanup();
});

describe("Compose", () => {
  it("sends trimmed text and ignores blanks", () => {
    const onSend = vi.fn();
    render(<Compose onSend={onSend} gpsHint="GPS on send" />);
    expect(screen.getByPlaceholderText("Message")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Message"), { target: { value: "  hi  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("hi");
  });

  it("opens the photo picker when asked", () => {
    const onPhoto = vi.fn();
    render(<Compose onSend={vi.fn()} onPhoto={onPhoto} />);
    fireEvent.click(screen.getByRole("button", { name: "attach" }));
    fireEvent.click(screen.getByRole("button", { name: "Photo" }));
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onPhoto).toHaveBeenCalled();
  });

  it("lists harness commands from a supplied catalog", () => {
    const onSend = vi.fn();
    const catalog = [
      { name: "new", hint: "reset this session" },
      { name: "tools", hint: "prefixed tool catalog" },
      { name: "tokens", hint: "prompt token breakdown" },
      { name: "toolstats", hint: "per-tool call ledger" },
    ];
    render(<Compose onSend={onSend} commands catalog={catalog} placeholder="Message Kit" />);
    expect(screen.queryByRole("listbox", { name: "Harness commands" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "attach" }));
    fireEvent.click(screen.getByRole("button", { name: "harness commands" }));
    expect(screen.getByText("These go to the crane, not the chat model.")).toBeTruthy();
    expect(screen.getByRole("option", { name: /^\/new / })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Message Kit"), { target: { value: "/to" } });
    expect(screen.getByRole("option", { name: /^\/tools / })).toBeTruthy();
    expect(screen.getByRole("option", { name: /^\/tokens / })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /^\/new / })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /^\/tools / }));
    expect(onSend).not.toHaveBeenCalled();
    expect((screen.getByPlaceholderText("Message Kit") as HTMLTextAreaElement).value).toBe("/tools");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("/tools");
  });

  it("inserts a trailing space for arg commands and Enter picks the highlight", () => {
    const onSend = vi.fn();
    const catalog = [
      { name: "new", hint: "reset this session" },
      { name: "cancel", hint: "stop the in-flight turn" },
      { name: "brief", hint: "hold a prefix ~6h", args: true },
    ];
    render(<Compose onSend={onSend} commands catalog={catalog} initialText="/" placeholder="Message Kit" />);
    const box = screen.getByPlaceholderText("Message Kit");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
    expect((box as HTMLTextAreaElement).value).toBe("/cancel");
    fireEvent.change(box, { target: { value: "/brief" } });
    fireEvent.click(screen.getByRole("option", { name: /^\/brief / }));
    expect((box as HTMLTextAreaElement).value).toBe("/brief ");
  });

  it("toggles GPS and pins from the attach menu", () => {
    const onPin = vi.fn();
    const onGpsToggle = vi.fn();
    const { rerender } = render(
      <Compose onSend={vi.fn()} onPin={onPin} gpsOn onGpsToggle={onGpsToggle} gpsHint="GPS on send" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "attach" }));
    expect(screen.getByRole("dialog", { name: "Attach" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "GPS on" }));
    expect(onGpsToggle).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "drop pin" }));
    expect(onPin).toHaveBeenCalledOnce();
    rerender(
      <Compose onSend={vi.fn()} onPin={onPin} gpsOn={false} onGpsToggle={onGpsToggle} gpsHint="GPS off" />,
    );
    expect((screen.getByRole("button", { name: "drop pin" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("warms GPS when the composer is focused", () => {
    const onEngage = vi.fn();
    render(<Compose onSend={vi.fn()} onEngage={onEngage} />);
    fireEvent.focus(screen.getByPlaceholderText("Message"));
    expect(onEngage).toHaveBeenCalledOnce();
  });

  it("inserts from the emoji picker and converts colon codes", () => {
    const onSend = vi.fn();
    render(<Compose onSend={onSend} />);
    const box = screen.getByPlaceholderText("Message");
    fireEvent.click(screen.getByRole("button", { name: "emoji" }));
    expect(screen.getByRole("dialog", { name: "Emoji" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: ":shrug:" }));
    expect((box as HTMLTextAreaElement).value).toBe("🤷");

    fireEvent.change(box, { target: { value: "ok :fire:" } });
    expect((box as HTMLTextAreaElement).value).toBe("ok 🔥");

    fireEvent.change(box, { target: { value: "yo :D" } });
    expect((box as HTMLTextAreaElement).value).toBe("yo :D");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("yo 😀");
  });

  it("stacks emoji and attach on the left of the draft", () => {
    render(<Compose onSend={vi.fn()} onPhoto={vi.fn()} />);
    const emoji = screen.getByRole("button", { name: "emoji" });
    const attach = screen.getByRole("button", { name: "attach" });
    const box = screen.getByPlaceholderText("Message");
    const send = screen.getByRole("button", { name: "Send" });
    expect(emoji.compareDocumentPosition(attach) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(attach.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(box.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const rail = emoji.parentElement;
    expect(rail?.contains(attach)).toBe(true);
    expect(rail?.className.split(/\s+/)).toEqual(expect.arrayContaining(["flex", "flex-col"]));
    expect(send.className.split(/\s+/)).toEqual(expect.arrayContaining(["self-stretch"]));
  });
});
