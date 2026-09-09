/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotifyEnable } from "@/app/components/chat/NotifyEnable";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "matchMedia");
});

function stubNotification(permission: NotificationPermission, request = vi.fn(async () => permission)) {
  const constructed: { title: string; opts?: NotificationOptions }[] = [];
  class FakeNotification {
    static permission = permission;
    static requestPermission = request;
    constructor(title: string, opts?: NotificationOptions) {
      constructed.push({ title, opts });
    }
  }
  vi.stubGlobal("Notification", FakeNotification);
  return { FakeNotification, constructed, request };
}

describe("NotifyEnable", () => {
  it("asks the OS and sends a test ping when granted", async () => {
    const { FakeNotification, constructed, request } = stubNotification("default", vi.fn(async () => {
      FakeNotification.permission = "granted";
      return "granted" as const;
    }));
    render(<NotifyEnable />);
    expect(screen.getByRole("button", { name: "Enable notifications" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enable notifications" }));
    });
    expect(request).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Send test ping" })).toBeTruthy();
    expect(screen.getByText("Sent a test ping.")).toBeTruthy();
    expect(constructed).toHaveLength(1);
    constructed.length = 0;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send test ping" }));
    });
    expect(constructed).toHaveLength(1);
  });

  it("explains a blocked permission", async () => {
    stubNotification("denied");
    render(<NotifyEnable />);
    expect(screen.getByText("Blocked — enable in system settings.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enable notifications" }));
    });
    expect(screen.getByText("Blocked — enable in system settings.")).toBeTruthy();
  });

  it("tells iPhone to install before enabling", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      permissions: undefined,
    });
    render(<NotifyEnable />);
    expect(screen.getByText("Install the app first, then enable.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Enable notifications" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
