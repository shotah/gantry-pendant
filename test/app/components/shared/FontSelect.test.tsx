/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FontSelect } from "@/app/components/shared/FontSelect";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-font");
  window.localStorage.removeItem("pendant.font");
});

describe("FontSelect", () => {
  it("picks a size onto the document", () => {
    render(<FontSelect />);
    expect(screen.getByRole("radiogroup", { name: "Font size" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Small" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Extra large" }));
    expect(screen.getByRole("radio", { name: "Extra large" }).getAttribute("aria-checked")).toBe("true");
    expect(document.documentElement.getAttribute("data-font")).toBe("xl");
    expect(localStorage.getItem("pendant.font")).toBe("xl");
  });
});
