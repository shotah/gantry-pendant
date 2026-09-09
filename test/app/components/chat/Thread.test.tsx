/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { bubbleFrom, Thread } from "@/app/components/chat/Thread";

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
    expect(screen.getByText("hi").closest(".text-chat")).toBeTruthy();
  });

  it("marks your pending bubble as sending", () => {
    render(
      <Thread
        messages={[{ id: "1", from: "you", text: "hi", at: 1, pending: true }]}
      />,
    );
    expect(screen.getByText("hi")).toBeTruthy();
    expect(screen.getByText("sending")).toBeTruthy();
  });

  it("does not mark kit bubbles as sending", () => {
    render(
      <Thread
        messages={[{ id: "2", from: "kit", text: "yo", at: 2, pending: true }]}
      />,
    );
    expect(screen.getByText("yo")).toBeTruthy();
    expect(screen.queryByText("sending")).toBeNull();
  });

  it("paints kit markdown instead of the source marks", () => {
    render(
      <Thread
        messages={[{ id: "2", from: "kit", text: "Try **this** path", at: 2 }]}
      />,
    );
    expect(screen.getByText("this").tagName).toBe("STRONG");
    expect(screen.queryByText("Try **this** path")).toBeNull();
  });

  it("treats flushed inbound as your bubble on the phone", () => {
    expect(bubbleFrom(true, "inbound")).toBe("you");
    expect(bubbleFrom(true, "reply")).toBe("kit");
    expect(bubbleFrom(true, "push")).toBe("kit");
    expect(bubbleFrom(false, "inbound")).toBe("you");
    expect(bubbleFrom(false, "reply")).toBe("you");
  });
});
