/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginDoor } from "@/app/components/chat/LoginDoor";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "userAgent");
});

function stubOidcConfig() {
  vi.stubGlobal("fetch", async (input: RequestInfo) => {
    if (String(input).includes("/api/auth/config")) {
      return Response.json({ mode: "oidc", google: true, dev: false, gap: null });
    }
    return new Response(null, { status: 404 });
  });
}

describe("LoginDoor", () => {
  it("says a crane is missing instead of offering Google", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo) => {
      if (String(input).includes("/api/auth/config")) {
        return Response.json({ mode: null, google: true, dev: false, gap: "crane" });
      }
      return new Response(null, { status: 404 });
    });
    render(<LoginDoor />);
    expect(await screen.findByText("No crane on this mailbox yet")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Continue with Google" })).toBeNull();
  });

  it("offers Google when oidc is armed", async () => {
    stubOidcConfig();
    const { container } = render(<LoginDoor />);
    expect(await screen.findByRole("link", { name: "Continue with Google" })).toBeTruthy();
    const door = container.querySelector("[data-shot=login]");
    expect(door?.className.split(/\s+/)).toEqual(expect.arrayContaining([
      "h-full",
      "pt-[env(safe-area-inset-top)]",
      "pb-[env(safe-area-inset-bottom)]",
    ]));
    expect(door?.className.split(/\s+/)).not.toContain("min-h-dvh");
    expect(screen.queryByText(/Add to Home Screen/)).toBeNull();
  });

  it("tells iPhone Safari to sign in before Add to Home Screen", async () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    });
    stubOidcConfig();
    render(<LoginDoor />);
    expect(await screen.findByRole("link", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.getByText(/Sign in here first, then Share → Add to Home Screen/)).toBeTruthy();
  });
});
