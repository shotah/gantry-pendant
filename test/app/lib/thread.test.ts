import { describe, expect, it } from "vitest";
import {
  ackSince,
  advanceCursor,
  capThread,
  failInThread,
  placeInThread,
  rememberSeen,
  type ThreadOrder,
} from "@/app/lib/thread";

describe("thread caps", () => {
  it("keeps the newest messages", () => {
    expect(capThread([1, 2, 3], 2)).toEqual([2, 3]);
    expect(capThread([1, 2], 5)).toEqual([1, 2]);
  });

  it("drops oldest seen ids first", () => {
    const seen = new Set(["a", "b", "c"]);
    rememberSeen(seen, "d", 3);
    expect([...seen]).toEqual(["b", "c", "d"]);
  });

  it("inserts catch-up by seq and keeps a draft last", () => {
    const late: ThreadOrder = { id: "b", at: 20, seq: 2 };
    const early: ThreadOrder = { id: "a", at: 10, seq: 1 };
    const draft: ThreadOrder = { id: "__draft__", at: 1, kind: "draft" };
    const ordered = placeInThread(placeInThread([late], early), draft);
    expect(ordered.map((m) => m.id)).toEqual(["a", "b", "__draft__"]);
    const pending = placeInThread<ThreadOrder>(
      [{ id: "mine", at: 50 }],
      { id: "missed", at: 40, seq: 4 },
    );
    expect(pending.map((m) => m.id)).toEqual(["missed", "mine"]);
  });

  it("marks the rejected bubble failed by id, else the newest pending one of yours", () => {
    type Bubble = ThreadOrder & { from: "you" | "kit"; pending?: boolean; failed?: string };
    const thread: Bubble[] = [
      { id: "old", at: 1, from: "you", pending: true },
      { id: "kit", at: 2, from: "kit" },
      { id: "new", at: 3, from: "you", pending: true },
      { id: "done", at: 4, from: "you" },
    ];
    const byId = failInThread(thread, "old", "Not sent.");
    expect(byId.find((m) => m.id === "old")).toEqual({ id: "old", at: 1, from: "you", failed: "Not sent.", pending: false });
    expect(byId.find((m) => m.id === "new")?.pending).toBe(true);
    const newest = failInThread(thread, undefined, "Not sent.");
    expect(newest.find((m) => m.id === "new")).toMatchObject({ failed: "Not sent.", pending: false });
    expect(newest.find((m) => m.id === "old")?.pending).toBe(true);
    const unknownId = failInThread(thread, "nope", "Not sent.");
    expect(unknownId.find((m) => m.id === "new")).toMatchObject({ failed: "Not sent.", pending: false });
    const settled: Bubble[] = [{ id: "done", at: 4, from: "you" }, { id: "kit", at: 5, from: "kit" }];
    expect(failInThread(settled, undefined, "Not sent.")).toBe(settled);
  });

  it("acks the highest seq, not the last arrival", () => {
    let cur = advanceCursor({ seq: 0 }, { id: "b", seq: 2 });
    cur = advanceCursor(cur, { id: "a", seq: 1 });
    expect(ackSince(cur)).toBe("2");
    expect(ackSince({ id: "legacy", seq: 0 })).toBe("legacy");
  });
});
