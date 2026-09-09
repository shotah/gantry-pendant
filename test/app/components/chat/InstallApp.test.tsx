/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallApp } from "@/app/components/chat/InstallApp";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "matchMedia");
});

function firePrompt(prompt: () => Promise<unknown>) {
  const ev = new Event("beforeinstallprompt", { cancelable: true, bubbles: true });
  Object.assign(ev, { prompt });
  act(() => {
    window.dispatchEvent(ev);
  });
}

describe("InstallApp", () => {
  it("points at Chrome's menu until beforeinstallprompt fires", () => {
    render(<InstallApp placement="block" />);
    expect(screen.getByText(/Cast, save and share/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Install app" })).toBeNull();
  });

  it("prompts from the header once Chrome offers install", async () => {
    const prompt = vi.fn().mockResolvedValue({ outcome: "accepted" });
    render(<InstallApp placement="header" />);
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
    firePrompt(prompt);
    expect(screen.getByRole("button", { name: "Install" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install" }));
    });
    expect(prompt).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
  });

  it("hides the control once the page is already a standalone app", () => {
    window.matchMedia = ((q: string) => ({
      matches: q === "(display-mode: standalone)",
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;
    render(<InstallApp placement="block" />);
    expect(screen.queryByText(/Cast, save and share/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Install app" })).toBeNull();
  });
});
