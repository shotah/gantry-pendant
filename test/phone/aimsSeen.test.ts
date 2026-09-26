import { describe, expect, it } from "vitest";
import { AIMS_SEEN_KEY, aimsFingerprint, aimsSeenPref, changedAims, writeAimsSeenPref } from "@/lib/phone/aimsSeen";
import type { AimRow } from "@/lib/mailbox/aims";

function row(area: string, sum7 = 6): AimRow {
  return { area, sentence: `${area} sentence`, rating30: 1.4, sum7, streak: 2, note: "asked", days: [] };
}

function memStorage() {
  const mem = new Map<string, string>();
  return {
    mem,
    storage: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
    },
  };
}

describe("changedAims", () => {
  it("counts a never-seen board whole and a seen board as nothing", () => {
    const board = [row("training"), row("weight")];
    expect(changedAims(board, {})).toBe(2);
    expect(changedAims(board, aimsFingerprint(board))).toBe(0);
  });

  it("counts new, changed, and gone aims — not the ones that stayed the same", () => {
    const seen = aimsFingerprint([row("training"), row("weight"), row("sleep")]);
    // training same, weight changed, sleep gone, reading new.
    expect(changedAims([row("training"), row("weight", 7), row("reading")], seen)).toBe(3);
  });

  it("reads an empty board as no changes when nothing was seen", () => {
    expect(changedAims([], {})).toBe(0);
  });
});

describe("aims seen pref", () => {
  it("round-trips through storage and drops junk", () => {
    const { mem, storage } = memStorage();
    expect(aimsSeenPref(storage)).toEqual({});
    expect(aimsSeenPref(null)).toEqual({});

    const seen = writeAimsSeenPref(storage, [row("training")]);
    expect(seen).toEqual(aimsFingerprint([row("training")]));
    expect(aimsSeenPref(storage)).toEqual(seen);

    mem.set(AIMS_SEEN_KEY, "not json");
    expect(aimsSeenPref(storage)).toEqual({});
    mem.set(AIMS_SEEN_KEY, JSON.stringify(["training"]));
    expect(aimsSeenPref(storage)).toEqual({});
    mem.set(AIMS_SEEN_KEY, JSON.stringify({ training: "{}", weight: 3 }));
    expect(aimsSeenPref(storage)).toEqual({ training: "{}" });
  });
});
