/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsMenu } from "@/app/components/chat/SettingsMenu";

afterEach(() => {
  cleanup();
});

describe("SettingsMenu", () => {
  it("keeps children closed until the cog is tapped", () => {
    render(
      <SettingsMenu>
        <p>panel body</p>
      </SettingsMenu>,
    );
    expect(screen.queryByText("panel body")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(screen.getByText("panel body")).toBeTruthy();
  });

  it("closes on Escape and an outside click", () => {
    render(
      <div>
        <p>outside</p>
        <SettingsMenu>
          <span>inside</span>
        </SettingsMenu>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    expect(screen.getByText("inside")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("inside")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    fireEvent.mouseDown(screen.getByText("outside"));
    expect(screen.queryByText("inside")).toBeNull();
  });
});
