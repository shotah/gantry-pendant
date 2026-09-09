/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginDoor } from "@/app/components/chat/LoginDoor";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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
    vi.stubGlobal("fetch", async (input: RequestInfo) => {
      if (String(input).includes("/api/auth/config")) {
        return Response.json({ mode: "oidc", google: true, dev: false, gap: null });
      }
      return new Response(null, { status: 404 });
    });
    render(<LoginDoor />);
    expect(await screen.findByRole("link", { name: "Continue with Google" })).toBeTruthy();
  });
});
