/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Thread } from "@/app/components/chat/Thread";

afterEach(() => {
  cleanup();
});

describe("Thread", () => {
  it("shows an empty mouth and then bubbles", () => {
    const { rerender } = render(<Thread messages={[]} />);
    expect(screen.getByText(/Nothing yet/)).toBeTruthy();
    rerender(
      <Thread
        messages={[
          { id: "1", from: "you", text: "hi", at: 1 },
          { id: "2", from: "kit", text: "yo", kind: "push", at: 2, photo: "data:image/jpeg;base64,aa" },
        ]}
      />,
    );
    expect(screen.getByText("hi")).toBeTruthy();
    expect(screen.getByText("yo")).toBeTruthy();
    expect(screen.getByText("ping")).toBeTruthy();
  });
});
