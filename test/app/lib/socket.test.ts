import { describe, expect, it } from "vitest";
import { mailboxUrl, parseIncoming } from "@/app/lib/socket";

describe("socket helpers", () => {
  it("builds a wss url with role and spike secret", () => {
    expect(mailboxUrl({
      host: "pendant.example.workers.dev",
      protocol: "https:",
      slug: "kit",
      role: "phone",
      secret: "s",
    })).toBe("wss://pendant.example.workers.dev/ws/kit?role=phone&secret=s");
    expect(mailboxUrl({
      host: "localhost:5173",
      protocol: "http:",
      slug: "kit",
      role: "crane",
      bearer: "tok",
    })).toContain("ws://localhost:5173/ws/kit");
  });

  it("parses incoming frames and rejects junk", () => {
    expect(parseIncoming('{"text":"hi"}')).toEqual({ text: "hi" });
    expect(parseIncoming("nope")).toBeNull();
    expect(parseIncoming("1")).toBeNull();
  });
});
