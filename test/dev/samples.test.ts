import { describe, expect, it } from "vitest";
import {
  DEV_USER,
  MOCK_PHOTO,
  MOCK_REPLIES,
  nextMockReply,
  parseSample,
  SAMPLE_IDS,
  SAMPLE_LINES,
  sampleScene,
} from "@/lib/dev/samples";

describe("samples", () => {
  it("parses known scene ids only", () => {
    expect(parseSample("thread")).toBe("thread");
    expect(parseSample("nope")).toBeNull();
    expect(parseSample(1)).toBeNull();
    expect(SAMPLE_IDS).toContain("unsigned");
  });

  it("ships Ada as the loopback mock human", () => {
    expect(DEV_USER.email).toBe("ada@example.com");
    expect(DEV_USER.sub).toMatch(/^\d+$/);
  });

  it("paints a live thread, a cron ping, and a hatch photo", () => {
    const thread = sampleScene("thread", "phone");
    expect(thread.status).toBe("up");
    expect(thread.gpsHint).toContain("±12m");
    expect(thread.messages.map((m) => m.text)).toEqual([
      SAMPLE_LINES.threadYou,
      SAMPLE_LINES.threadKitLatch,
      SAMPLE_LINES.threadYouLeave,
      SAMPLE_LINES.threadKit,
    ]);

    const ping = sampleScene("ping", "phone");
    expect(ping.messages[0]?.kind).toBe("push");
    expect(ping.messages[0]?.text).toBe(SAMPLE_LINES.ping);

    const photo = sampleScene("photo", "phone");
    expect(photo.messages[0]?.photo).toBe(MOCK_PHOTO);
    expect(MOCK_PHOTO.startsWith("data:image/svg+xml")).toBe(true);
    expect(photo.messages[1]?.text).toBe(SAMPLE_LINES.photoKit);
  });

  it("keeps empty, unsigned, down, and crane distinct", () => {
    expect(sampleScene("unsigned", "phone")).toEqual({ id: "unsigned", messages: [], status: "idle" });
    expect(sampleScene("empty", "phone").gpsHint).toMatch(/GPS attaches/);
    expect(sampleScene("empty", "crane").gpsHint).toBeUndefined();
    expect(sampleScene("down", "phone").status).toBe("down");
    expect(sampleScene("crane", "crane").messages[1]?.text).toBe(SAMPLE_LINES.craneKit);
    expect(sampleScene("thread", "crane").gpsHint).toBeUndefined();
    expect(sampleScene("cmds", "phone").draft).toBe("/");
    expect(sampleScene("cmds", "phone").catalog?.map((c) => c.name)).toEqual(["new", "status", "brief"]);
    expect(sampleScene("empty", "phone").draft).toBeUndefined();
  });

  it("rotates canned Kit replies", () => {
    expect(nextMockReply(0)).toBe(MOCK_REPLIES[0]);
    expect(nextMockReply(MOCK_REPLIES.length)).toBe(MOCK_REPLIES[0]);
    expect(nextMockReply(1)).toBe(MOCK_REPLIES[1]);
  });
});
