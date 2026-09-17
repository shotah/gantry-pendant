import { describe, expect, it } from "vitest";
import { blankDraft, clearsDraft, cranePublishedDraft, phoneMustNotPublishDraft } from "@/lib/mailbox/draft";

describe("draft frames", () => {
  it("only the crane may publish a draft bubble", () => {
    expect(phoneMustNotPublishDraft("phone", "draft")).toBe(true);
    expect(phoneMustNotPublishDraft("crane", "draft")).toBe(false);
    expect(phoneMustNotPublishDraft("phone", "reply")).toBe(false);
    expect(cranePublishedDraft("crane", "draft")).toBe(true);
    expect(cranePublishedDraft("phone", "draft")).toBe(false);
  });

  it("calls a draft blank when it has no words", () => {
    expect(blankDraft({})).toBe(true);
    expect(blankDraft({ text: " \n" })).toBe(true);
    expect(blankDraft({ text: "Looks like" })).toBe(false);
  });

  it("only reply and error end the held draft", () => {
    expect(clearsDraft("reply")).toBe(true);
    expect(clearsDraft("error")).toBe(true);
    expect(clearsDraft("push")).toBe(false);
    expect(clearsDraft("typing")).toBe(false);
    expect(clearsDraft(undefined)).toBe(false);
  });
});
