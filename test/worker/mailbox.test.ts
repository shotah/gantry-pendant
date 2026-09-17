import { describe, expect, it, vi } from "vitest";
import type { WireFrame } from "@/lib/mailbox/frame";
import { QUEUE_STORE_PREFIX, type Queued } from "@/lib/mailbox/queue";
import { socketTags } from "@/lib/mailbox/tags";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    protected ctx: unknown;
    protected env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

vi.stubGlobal("WebSocketRequestResponsePair", class {
  constructor(readonly request: string, readonly response: string) {}
});

const { Mailbox } = await import("@/worker/mailbox");

const OPEN = 1;
const CLOSING = 2;

/** Mirrors workerd: `send()` on a socket past OPEN throws synchronously. */
class FakeSocket {
  readyState = OPEN;
  sent: string[] = [];

  send(body: string): void {
    if (this.readyState !== OPEN) {
      throw new TypeError("Can't call WebSocket send() after close().");
    }
    this.sent.push(body);
  }

  close(): void {
    this.readyState = CLOSING;
  }

  frames(): WireFrame[] {
    return this.sent.map((s) => JSON.parse(s) as WireFrame);
  }

  kinds(): (string | undefined)[] {
    return this.frames().map((f) => f.kind);
  }
}

class FakeStorage {
  rows = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.rows.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.rows.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.rows.delete(key);
  }

  async list<T>(opts?: { prefix?: string }): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    const keys = [...this.rows.keys()].sort((a, b) => a.localeCompare(b));
    for (const k of keys) {
      if (!opts?.prefix || k.startsWith(opts.prefix)) {
        out.set(k, this.rows.get(k) as T);
      }
    }
    return out;
  }

  queued(): Queued[] {
    return [...this.rows.entries()]
      .filter(([k]) => k.startsWith(QUEUE_STORE_PREFIX))
      .map(([, v]) => v as Queued);
  }
}

/**
 * Enough of `DurableObjectState` for the mailbox. Like the real thing,
 * `getWebSockets` keeps listing a socket after `close()` until the peer
 * answers — that half-open socket is the one an unguarded fan trips over.
 */
class FakeState {
  storage = new FakeStorage();
  private readonly sockets: { ws: FakeSocket; tags: string[] }[] = [];

  setWebSocketAutoResponse(): void {}

  acceptWebSocket(ws: FakeSocket, tags: string[]): void {
    this.sockets.push({ ws, tags });
  }

  getWebSockets(tag?: string): FakeSocket[] {
    return this.sockets.filter((s) => tag == null || s.tags.includes(tag)).map((s) => s.ws);
  }

  getTags(ws: FakeSocket): string[] {
    return this.sockets.find((s) => s.ws === ws)?.tags ?? [];
  }
}

type Ctx = ConstructorParameters<typeof Mailbox>[0];
type Env = ConstructorParameters<typeof Mailbox>[1];
type Flushable = { flush(ws: FakeSocket, role: "phone" | "crane", userId?: string): Promise<void> };

function room() {
  const state = new FakeState();
  const box = new Mailbox(state as unknown as Ctx, {} as Env);
  const crane = new FakeSocket();
  state.acceptWebSocket(crane, socketTags({ role: "crane", rateId: "bearer:kit" }));
  const phone = (sub: string): FakeSocket => {
    const ws = new FakeSocket();
    state.acceptWebSocket(ws, socketTags({ role: "phone", rateId: `sub:${sub}`, userId: sub }));
    return ws;
  };
  const say = (ws: FakeSocket, frame: object): Promise<void> =>
    box.webSocketMessage(ws as unknown as WebSocket, JSON.stringify(frame));
  const connect = (ws: FakeSocket, sub?: string): Promise<void> =>
    (box as unknown as Flushable).flush(ws, "phone", sub);
  return { state, box, crane, phone, say, connect };
}

describe("Mailbox fan-out", () => {
  it("skips a half-open sibling socket so the live one still gets typing, draft, reply", async () => {
    const { crane, phone, say } = room();
    const stale = phone("1182");
    stale.close(); // Cab's cancel()ed sweep socket, still listed by getWebSockets
    const live = phone("1182");

    await say(crane, { kind: "typing", user_id: "1182" });
    await say(crane, { kind: "draft", user_id: "1182", text: "Looks like" });
    await say(crane, { kind: "reply", user_id: "1182", text: "Looks like rain." });

    expect(stale.sent).toEqual([]);
    expect(live.kinds()).toEqual(["typing", "draft", "reply"]);
    expect(live.frames()[2]?.text).toBe("Looks like rain.");
  });

  it("survives a socket that reports OPEN but throws on send", async () => {
    const { crane, phone, say } = room();
    const flaky = phone("1182");
    flaky.send = () => {
      throw new TypeError("Can't call WebSocket send() after close().");
    };
    const live = phone("1182");

    await expect(say(crane, { kind: "draft", user_id: "1182", text: "Hello" })).resolves.toBeUndefined();
    await say(crane, { kind: "reply", user_id: "1182", text: "Hello there." });

    expect(live.kinds()).toEqual(["draft", "reply"]);
  });

  it("queues for the crane when every crane socket is stale, not just when none is listed", async () => {
    const { state, crane, phone, say } = room();
    crane.close();
    const ada = phone("1182");

    await say(ada, { id: "m1", text: "are you there" });

    const forCrane = state.storage.queued().filter((q) => q.to === "crane");
    expect(forCrane).toHaveLength(1);
    expect(forCrane[0]?.body).toContain("are you there");
    expect(ada.kinds()).toEqual(["ack"]);
  });

  it("announces a room notice past a stale socket", async () => {
    const { state, box, phone } = room();
    const stale = phone("1182");
    stale.close();
    const live = phone("7");

    const res = await box.fetch(new Request("https://mailbox/", {
      method: "PUT",
      headers: { "X-Pendant-Op": "theme", "content-type": "application/json" },
      body: JSON.stringify({ theme: "noir" }),
    }));

    expect(res.ok).toBe(true);
    expect(stale.sent).toEqual([]);
    expect(live.frames()).toEqual([{ kind: "theme", theme: "noir" }]);
    expect(state.storage.rows.get("theme")).toBe("noir");
  });
});

describe("Mailbox junk frames", () => {
  it("drops a blank draft instead of blanking every phone", async () => {
    const { crane, phone, say } = room();
    const ada = phone("1182");

    await say(crane, { kind: "draft", user_id: "1182" });
    await say(crane, { kind: "draft", user_id: "1182", text: "   " });

    expect(ada.sent).toEqual([]);
  });

  it("refuses an empty reply as a bad frame and stores nothing", async () => {
    const { state, crane, phone, say } = room();
    const ada = phone("1182");

    await say(crane, { kind: "reply", user_id: "1182", id: "r9", text: "  " });

    expect(crane.frames()).toEqual([{ kind: "error", text: "bad frame", id: "r9" }]);
    expect(ada.sent).toEqual([]);
    expect(state.storage.rows.size).toBe(0);
  });

  it("still passes a reply that is only a photo", async () => {
    const { crane, phone, say } = room();
    const ada = phone("1182");

    await say(crane, { kind: "reply", user_id: "1182", images: [{ url: "https://cdn.example/rain.jpg" }] });

    expect(ada.kinds()).toEqual(["reply"]);
    expect(ada.frames()[0]?.images?.[0]?.url).toBe("https://cdn.example/rain.jpg");
  });
});

describe("Mailbox crane rate", () => {
  it("does not spend the crane's bucket on typing or draft", async () => {
    const { crane, phone, say } = room();
    const ada = phone("1182");

    for (let i = 0; i < 40; i += 1) {
      await say(crane, { kind: "typing", user_id: "1182" });
      await say(crane, { kind: "draft", user_id: "1182", text: `token ${i}` });
    }
    await say(crane, { kind: "reply", user_id: "1182", text: "done" });

    expect(crane.sent).toEqual([]);
    expect(ada.kinds().at(-1)).toBe("reply");
    expect(ada.kinds().filter((k) => k === "typing")).toHaveLength(40);
  });

  it("still meters turns", async () => {
    const { crane, phone, say } = room();
    phone("1182");

    for (let i = 0; i < 30; i += 1) {
      await say(crane, { kind: "reply", user_id: "1182", text: `turn ${i}` });
    }
    expect(crane.sent).toEqual([]);
    await say(crane, { kind: "reply", user_id: "1182", text: "one more" });
    expect(crane.frames()).toEqual([{ kind: "error", text: "rate" }]);
  });
});

describe("Mailbox held draft", () => {
  it("hands the latest draft back to a phone that connects mid-answer", async () => {
    const { crane, phone, say, connect } = room();
    await say(crane, { kind: "draft", user_id: "1182", text: "Looks" });
    await say(crane, { kind: "draft", user_id: "1182", text: "Looks like rain" });
    await say(crane, { kind: "draft", user_id: "1182", text: "" }); // blank: dropped, does not clear

    const back = phone("1182");
    await connect(back, "1182");
    expect(back.frames()).toEqual([{ kind: "draft", user_id: "1182", text: "Looks like rain" }]);

    const other = phone("7");
    await connect(other, "7");
    expect(other.sent).toEqual([]);

    const anon = phone("");
    await connect(anon);
    expect(anon.sent).toEqual([]);
  });

  it("forgets the draft once the reply lands", async () => {
    const { crane, phone, say, connect } = room();
    await say(crane, { kind: "draft", user_id: "1182", text: "Looks like" });
    await say(crane, { kind: "reply", user_id: "1182", text: "Looks like rain." });

    const back = phone("1182");
    await connect(back, "1182");

    expect(back.kinds()).not.toContain("draft");
    expect(back.frames().some((f) => f.kind === "reply" && f.text === "Looks like rain.")).toBe(true);
  });

  it("forgets the draft on an error for that human", async () => {
    const { crane, phone, say, connect } = room();
    await say(crane, { kind: "draft", user_id: "1182", text: "Looks like" });
    await say(crane, { kind: "error", user_id: "1182", text: "tool failed" });

    const back = phone("1182");
    await connect(back, "1182");

    expect(back.kinds()).not.toContain("draft");
  });
});
