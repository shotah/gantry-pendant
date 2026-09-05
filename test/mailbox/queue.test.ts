import { describe, expect, it } from "vitest";
import { QUEUE_MAX, QUEUE_TTL_MS } from "@/lib/mailbox/caps";
import { drainFor, enqueue, newQueueId, pruneQueue, type Queued } from "@/lib/mailbox/queue";

function msg(over: Partial<Queued> = {}): Queued {
  return { id: "1", to: "phone", body: "{}", at: 1_000, ...over };
}

describe("queue", () => {
  it("drops stale items and keeps a short live list", () => {
    const stale = msg({ id: "old", at: 0 });
    const live = msg({ id: "new", at: QUEUE_TTL_MS });
    expect(pruneQueue([stale, live], QUEUE_TTL_MS + 1).map((m) => m.id)).toEqual(["new"]);
  });

  it("caps length by dropping the oldest", () => {
    const items = Array.from({ length: QUEUE_MAX }, (_, i) => msg({ id: String(i), at: 10 }));
    const next = enqueue(items, msg({ id: "tail", at: 10 }), { now: 10, max: QUEUE_MAX });
    expect(next).toHaveLength(QUEUE_MAX);
    expect(next[0]?.id).toBe("1");
    expect(next.at(-1)?.id).toBe("tail");
  });

  it("drains one side and leaves the other", () => {
    const items = [
      msg({ id: "p", to: "phone", at: 5 }),
      msg({ id: "c", to: "crane", at: 5 }),
    ];
    const { kept, take } = drainFor(items, "phone", 5);
    expect(take.map((m) => m.id)).toEqual(["p"]);
    expect(kept.map((m) => m.id)).toEqual(["c"]);
  });

  it("mints ids", () => {
    expect(newQueueId(1, () => 0.5)).toMatch(/^1-/);
  });
});
