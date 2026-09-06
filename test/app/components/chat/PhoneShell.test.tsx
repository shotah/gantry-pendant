/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhoneShell } from "@/app/components/chat/PhoneShell";
import { DEV_USER, MOCK_REPLIES, SAMPLE_LINES } from "@/lib/dev/samples";

function stubAuth(dev: boolean) {
  vi.stubGlobal("fetch", async (input: RequestInfo) => {
    const url = String(input);
    if (url.includes("/api/auth/config")) {
      return Response.json({ mode: "spike", google: false, dev });
    }
    if (url.includes("/api/auth/me")) {
      return dev ? Response.json(DEV_USER) : new Response(null, { status: 401 });
    }
    return new Response(null, { status: 404 });
  });
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  window.localStorage.removeItem("pendant.geo");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
  window.localStorage.removeItem("pendant.geo");
  Reflect.deleteProperty(navigator, "geolocation");
});

describe("PhoneShell", () => {
  it("paints a sample thread only when loopback dev is on", async () => {
    window.history.replaceState({}, "", "/?sample=thread");
    stubAuth(true);
    render(<PhoneShell />);
    expect(await screen.findByText(SAMPLE_LINES.threadKit)).toBeTruthy();
    expect(screen.getByText(SAMPLE_LINES.threadYou)).toBeTruthy();
    expect(screen.getByText("Kit")).toBeTruthy();
    expect(screen.queryByText("dev")).toBeNull();
  });

  it("ignores sample query when not in dev", async () => {
    window.history.replaceState({}, "", "/?sample=thread");
    stubAuth(false);
    render(<PhoneShell />);
    expect(await screen.findByText(/Nothing yet/)).toBeTruthy();
    expect(screen.queryByText(SAMPLE_LINES.threadKit)).toBeNull();
  });

  it("shows the Google gate for the unsigned sample", async () => {
    window.history.replaceState({}, "", "/?sample=unsigned");
    stubAuth(true);
    render(<PhoneShell />);
    expect(await screen.findByText("Sign in with Google to talk.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Change Kit's photo" })).toBeNull();
  });

  it("echoes a canned Kit reply in dev without a socket", async () => {
    stubAuth(true);
    render(<PhoneShell />);
    expect(await screen.findByText("live")).toBeTruthy();
    const box = screen.getByPlaceholderText(/Message Kit/);
    fireEvent.change(box, { target: { value: "hello kit" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("hello kit")).toBeTruthy();
    expect(await screen.findByText(MOCK_REPLIES[0], {}, { timeout: 1000 })).toBeTruthy();
    expect(screen.getByText(/dev/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change Kit's photo" })).toBeTruthy();
  });

  it("keeps agent name, theme, and the crane stand-in behind the settings cog", async () => {
    stubAuth(true);
    render(<PhoneShell />);
    expect(await screen.findByText("live")).toBeTruthy();
    expect(screen.getByText("Kit")).toBeTruthy();
    expect(screen.queryByLabelText("Agent name")).toBeNull();
    expect(screen.queryByRole("button", { name: "color theme" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open crane stand-in" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(screen.getByLabelText("Agent name")).toBeTruthy();
    expect((screen.getByLabelText("Agent name") as HTMLInputElement).value).toBe("kit");
    expect(screen.getByLabelText("Agent access secret")).toBeTruthy();
    expect(screen.getByRole("button", { name: "color theme" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open crane stand-in" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Agent name"), { target: { value: "Ada" } });
    expect((screen.getByLabelText("Agent name") as HTMLInputElement).value).toBe("ada");
    expect(screen.getByText("Ada")).toBeTruthy();
  });

  it("paints the harness command picker for the cmds sample", async () => {
    window.history.replaceState({}, "", "/?sample=cmds");
    stubAuth(true);
    render(<PhoneShell />);
    expect(await screen.findByText("These go to the crane, not the chat model.")).toBeTruthy();
    expect(screen.getByRole("option", { name: /^\/new / })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "attach" }));
    expect(screen.getByRole("button", { name: "harness commands" })).toBeTruthy();
  });

  it("skips geolocation when GPS is toggled off", async () => {
    const geo = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: geo },
    });
    stubAuth(true);
    render(<PhoneShell />);
    expect(await screen.findByText("live")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "attach" }));
    fireEvent.click(screen.getByRole("button", { name: "GPS on" }));
    expect(screen.getByRole("button", { name: "GPS off" })).toBeTruthy();
    expect(screen.getByText("GPS off")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Message Kit/), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("hi")).toBeTruthy();
    expect(geo).not.toHaveBeenCalled();
  });

  it("does not append a bubble for a silent pin without a fix", async () => {
    stubAuth(true);
    render(<PhoneShell />);
    expect(await screen.findByText("live")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "attach" }));
    fireEvent.click(screen.getByRole("button", { name: "drop pin" }));
    expect(await screen.findByText("GPS omitted (denied or unavailable)")).toBeTruthy();
    expect(screen.getByText(/Nothing yet/)).toBeTruthy();
  });
});
