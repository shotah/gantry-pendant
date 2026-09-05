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
    expect(screen.getByText("GPS on send")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Message"), { target: { value: "  hi  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("hi");
  });

  it("opens the photo picker when asked", () => {
    const onPhoto = vi.fn();
    render(<Compose onSend={vi.fn()} onPhoto={onPhoto} />);
    fireEvent.click(screen.getByRole("button", { name: "photo" }));
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onPhoto).toHaveBeenCalled();
  });
});
