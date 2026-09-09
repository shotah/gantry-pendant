import { describe, expect, it } from "vitest";
import { cranePublishedDraft, phoneMustNotPublishDraft } from "@/lib/mailbox/draft";

describe("draft frames", () => {
  it("only the crane may publish a draft bubble", () => {
    expect(phoneMustNotPublishDraft("phone", "draft")).toBe(true);
    expect(phoneMustNotPublishDraft("crane", "draft")).toBe(false);
    expect(phoneMustNotPublishDraft("phone", "reply")).toBe(false);
    expect(cranePublishedDraft("crane", "draft")).toBe(true);
    expect(cranePublishedDraft("phone", "draft")).toBe(false);
  });
});
