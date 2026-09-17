import { afterEach, describe, expect, it, vi } from "vitest";
import { HELD_DRAFT_TTL_MS } from "@/lib/mailbox/draft";
import type { WireFrame } from "@/lib/mailbox/frame";
import { QUEUE_STORE_PREFIX, type Queued } from "@/lib/mailbox/queue";
import { socketTags } from "@/lib/mailbox/tags";
import { PUSH_STORE_PREFIX } from "@/lib/push/subscription";
import { encodeBase64Url, generateVapidKeys } from "@/lib/push/vapid";

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

function room(env: Record<string, string> = {}) {
  const state = new FakeState();
  const box = new Mailbox(state as unknown as Ctx, env as unknown as Env);
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
  it("drops a blank draft when no draft is held", async () => {
    const { crane, phone, say } = room();
    const ada = phone("1182");

    await say(crane, { kind: "draft", user_id: "1182" });
    await say(crane, { kind: "draft", user_id: "1182", text: "   " });

    expect(ada.sent).toEqual([]);
  });

  it("forwards a blank draft as the clear while a draft is held, then forgets it", async () => {
    const { crane, phone, say, connect } = room();
    const ada = phone("1182");

    await say(crane, { kind: "draft", user_id: "1182", text: "Looks like" });
    await say(crane, { kind: "draft", user_id: "1182" }); // crane Discard: cancel / empty turn
    await say(crane, { kind: "draft", user_id: "1182", text: " " }); // second blank: nothing held, noise

    expect(ada.frames()).toEqual([
      { kind: "draft", user_id: "1182", text: "Looks like" },
      { kind: "draft", user_id: "1182", text: "" },
    ]);

    const back = phone("1182");
    await connect(back, "1182");
    expect(back.sent).toEqual([]);
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

describe("Mailbox seen acks", () => {
  it("copies a phone's seen ack to that human's other mouths, not the sender, not another human", async () => {
    const { crane, phone, say } = room();
    const pwa = phone("1182");
    const cab = phone("1182");
    const bob = phone("7");

    await say(pwa, { kind: "ack", since: "4", seen: true });

    expect(cab.frames()).toEqual([{ kind: "ack", seen: true, user_id: "1182", since: "4" }]);
    expect(pwa.sent).toEqual([]);
    expect(bob.sent).toEqual([]);
    expect(crane.frames()).toEqual([{ kind: "ack", since: "4", seen: true, user_id: "1182" }]);
  });

  it("keeps a bare seen ack away from the crane", async () => {
    const { crane, phone, say } = room();
    const pwa = phone("1182");
    const cab = phone("1182");

    await say(pwa, { kind: "ack", seen: true });

    expect(cab.frames()).toEqual([{ kind: "ack", seen: true, user_id: "1182" }]);
    expect(crane.sent).toEqual([]);
  });

  it("never copies a plain delivery ack", async () => {
    const { crane, phone, say } = room();
    const pwa = phone("1182");
    const cab = phone("1182");

    await say(pwa, { kind: "ack", since: "4" });
    await say(pwa, { kind: "ack", id: "m1" });

    expect(cab.sent).toEqual([]);
    expect(crane.kinds()).toEqual(["ack", "ack"]);
  });

  it("acks a seen reply id for the phone like any ack", async () => {
    const { state, crane, phone, say } = room();
    const pwa = phone("1182");
    await say(crane, { kind: "reply", id: "r1", user_id: "1182", text: "Rain." });
    expect(state.storage.queued().some((q) => q.id === "r1" && q.to === "phone")).toBe(true);

    await say(pwa, { kind: "ack", id: "r1", seen: true });

    expect(state.storage.queued().some((q) => q.id === "r1")).toBe(false);
  });
});

describe("Mailbox held draft", () => {
  it("hands the latest draft back to a phone that connects mid-answer", async () => {
    const { crane, phone, say, connect } = room();
    await say(crane, { kind: "draft", user_id: "1182", text: "Looks" });
    await say(crane, { kind: "draft", user_id: "1182", text: "Looks like rain" });

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

  it("forgets every held draft when the last crane socket goes", async () => {
    const { box, crane, phone, say, connect } = room();
    await say(crane, { kind: "draft", user_id: "1182", text: "Looks like" });
    await say(crane, { kind: "draft", user_id: "7", text: "Two days" });

    crane.close();
    await box.webSocketClose(crane as unknown as WebSocket);

    const ada = phone("1182");
    await connect(ada, "1182");
    const bob = phone("7");
    await connect(bob, "7");
    expect(ada.sent).toEqual([]);
    expect(bob.sent).toEqual([]);
  });

  it("forgets on a crane socket error too", async () => {
    const { box, crane, phone, say, connect } = room();
    await say(crane, { kind: "draft", user_id: "1182", text: "Looks like" });

    await box.webSocketError(crane as unknown as WebSocket);

    const ada = phone("1182");
    await connect(ada, "1182");
    expect(ada.sent).toEqual([]);
  });

  it("keeps the draft when a fresh-dial crane socket closes while the main one is up", async () => {
    const { state, box, crane, phone, say, connect } = room();
    await say(crane, { kind: "draft", user_id: "1182", text: "Looks like" });

    const dial = new FakeSocket();
    state.acceptWebSocket(dial, socketTags({ role: "crane", rateId: "bearer:kit" }));
    dial.close();
    await box.webSocketClose(dial as unknown as WebSocket);

    const ada = phone("1182");
    await connect(ada, "1182");
    expect(ada.frames()).toEqual([{ kind: "draft", user_id: "1182", text: "Looks like" }]);
  });

  it("does not forget when a phone socket goes", async () => {
    const { box, crane, phone, say, connect } = room();
    const first = phone("1182");
    await say(crane, { kind: "draft", user_id: "1182", text: "Looks like" });

    first.close();
    await box.webSocketClose(first as unknown as WebSocket);

    const back = phone("1182");
    await connect(back, "1182");
    expect(back.frames()).toEqual([{ kind: "draft", user_id: "1182", text: "Looks like" }]);
  });

  it("expires a held draft after 60 s with no words and no typing; typing is life", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000_000);
      const { crane, phone, say, connect } = room();
      await say(crane, { kind: "draft", user_id: "1182", text: "Looks like" });

      vi.setSystemTime(1_000_000 + 50_000);
      await say(crane, { kind: "typing", user_id: "1182" });

      vi.setSystemTime(1_000_000 + 100_000); // 100 s after the words, 50 s after the chip
      const alive = phone("1182");
      await connect(alive, "1182");
      expect(alive.frames()).toEqual([{ kind: "draft", user_id: "1182", text: "Looks like" }]);

      vi.setSystemTime(1_000_000 + 50_000 + HELD_DRAFT_TTL_MS + 1);
      const ghost = phone("1182");
      await connect(ghost, "1182");
      expect(ghost.sent).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Mailbox round-trip push test", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The push service's answer. A spy, not a stub — the file-level socket stub must survive. */
  function pushServiceSays(status: number, onUrl?: (url: string) => void) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      onUrl?.(String(input));
      return new Response(null, { status });
    });
  }

  async function vapidEnv(): Promise<Record<string, string>> {
    const keys = await generateVapidKeys();
    return {
      VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: JSON.stringify(keys.privateJwk),
      VAPID_SUBJECT: "mailto:ada@example.com",
    };
  }

  async function clientSub(endpoint: string) {
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    const auth = crypto.getRandomValues(new Uint8Array(16));
    return { endpoint, keys: { p256dh: encodeBase64Url(raw), auth: encodeBase64Url(auth) } };
  }

  function pushOp(method: string, sub: string, body: object): Request {
    return new Request("https://mailbox/push", {
      method,
      headers: { "X-Pendant-Op": "push", "X-Pendant-Sub": sub, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("pushes a real test card to this human's rows and reports the push service's answer", async () => {
    const { state, box } = room(await vapidEnv());
    const subscription = await clientSub("https://fcm.googleapis.com/fcm/send/ada-phone");
    expect((await box.fetch(pushOp("PUT", "1182", { slug: "kit", subscription }))).ok).toBe(true);
    const bob = await clientSub("https://fcm.googleapis.com/fcm/send/bob-phone");
    expect((await box.fetch(pushOp("PUT", "7", { slug: "kit", subscription: bob }))).ok).toBe(true);

    const pushService = pushServiceSays(201, (url) => expect(url).toBe(subscription.endpoint));
    const ok = await box.fetch(pushOp("POST", "1182", { slug: "kit" }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ rows: 1, ok: 1, gone: 0, fail: 0, statuses: [] });
    expect(pushService).toHaveBeenCalledOnce();

    pushServiceSays(403);
    const refused = await box.fetch(pushOp("POST", "1182", { slug: "kit" }));
    expect(await refused.json()).toEqual({ rows: 1, ok: 0, gone: 0, fail: 1, statuses: [403] });

    pushServiceSays(410);
    const gone = await box.fetch(pushOp("POST", "1182", { slug: "kit" }));
    expect(await gone.json()).toEqual({ rows: 1, ok: 0, gone: 1, fail: 0, statuses: [] });
    const left = [...state.storage.rows.keys()].filter((k) => k.startsWith(PUSH_STORE_PREFIX));
    expect(left).toHaveLength(1);
    expect(left[0]).toContain(":7:");

    const empty = await box.fetch(pushOp("POST", "1182", { slug: "kit" }));
    expect(await empty.json()).toEqual({ rows: 0, ok: 0, gone: 0, fail: 0, statuses: [] });
  });

  it("is 404 without VAPID keys and 400 on a junk body", async () => {
    const bare = room();
    expect((await bare.box.fetch(pushOp("POST", "1182", { slug: "kit" }))).status).toBe(404);
    const keyed = room(await vapidEnv());
    expect((await keyed.box.fetch(pushOp("POST", "1182", { slug: "nope!" }))).status).toBe(400);
  });
});

describe("Mailbox reactions", () => {
  it("fans Kit's reaction to the human's mouths, stores it, and hydrates it after the bubble", async () => {
    const { state, crane, phone, say, connect } = room();
    const pwa = phone("1182");
    const cab = phone("1182");
    const bob = phone("7");
    await say(pwa, { id: "m1", text: "thanks!" });

    await say(crane, { kind: "react", user_id: "1182", id: "m1", text: "👍" });

    expect(cab.frames().filter((f) => f.kind === "react")).toEqual([
      { kind: "react", id: "m1", text: "👍", user_id: "1182" },
    ]);
    expect(pwa.frames().filter((f) => f.kind === "react")).toEqual([
      { kind: "react", id: "m1", text: "👍", user_id: "1182" },
    ]);
    expect(bob.sent).toEqual([]);
    expect(state.storage.queued().some((q) => q.kind === "react")).toBe(false);
    expect(state.storage.rows.get("r:1182")).toEqual({ m1: "👍" });

    const fresh = phone("1182");
    await connect(fresh, "1182");
    const kinds = fresh.kinds();
    expect(kinds.indexOf("react")).toBeGreaterThan(kinds.indexOf("inbound"));
    expect(fresh.frames().find((f) => f.kind === "react")).toEqual({
      kind: "react", id: "m1", text: "👍", user_id: "1182", replay: true,
    });
  });

  it("hands the human's reaction to the crane and their other mouths, not back to the sender", async () => {
    const { state, crane, phone, say } = room();
    const pwa = phone("1182");
    const cab = phone("1182");
    await say(crane, { kind: "reply", id: "r1", user_id: "1182", text: "Rain at 6." });
    crane.sent.length = 0;
    pwa.sent.length = 0;
    cab.sent.length = 0;

    await say(pwa, { kind: "react", id: "r1", text: "❤️" });

    expect(crane.frames()).toEqual([{ kind: "react", id: "r1", text: "❤️", user_id: "1182" }]);
    expect(cab.frames()).toEqual([{ kind: "react", id: "r1", text: "❤️", user_id: "1182" }]);
    expect(pwa.sent).toEqual([]);
    expect(state.storage.rows.get("r:1182")).toEqual({ r1: "❤️" });

    await say(pwa, { kind: "react", id: "r1", text: "" });
    expect(crane.frames().at(-1)).toEqual({ kind: "react", id: "r1", text: "", user_id: "1182" });
    expect(cab.frames().at(-1)).toEqual({ kind: "react", id: "r1", text: "", user_id: "1182" });
    expect(state.storage.rows.has("r:1182")).toBe(false);
  });

  it("queues the human's reaction when no crane socket is up; latest on a bubble wins; the crane drains it on connect", async () => {
    const { state, box, crane, phone, say } = room();
    const pwa = phone("1182");
    await say(crane, { kind: "reply", id: "r1", user_id: "1182", text: "Rain at 6." });
    await say(crane, { kind: "reply", id: "r2", user_id: "1182", text: "Bring a coat." });
    crane.close();
    pwa.sent.length = 0;

    await say(pwa, { kind: "react", id: "r1", text: "👍" });
    await say(pwa, { kind: "react", id: "r1", text: "❤️" });
    await say(pwa, { kind: "react", id: "r2", text: "🔥" });

    const forCrane = state.storage.queued().filter((q) => q.to === "crane");
    expect(forCrane.map((q) => [q.id, q.kind])).toEqual([["r1", "react"], ["r2", "react"]]);
    expect(pwa.sent).toEqual([]); // no ack for a react, no error either
    expect(state.storage.rows.get("r:1182")).toEqual({ r1: "❤️", r2: "🔥" });

    const back = new FakeSocket();
    state.acceptWebSocket(back, socketTags({ role: "crane", rateId: "bearer:kit" }));
    await (box as unknown as Flushable).flush(back, "crane");
    const reacts = back.frames().filter((f) => f.kind === "react");
    expect(reacts.map((f) => [f.id, f.text, f.user_id])).toEqual([["r1", "❤️", "1182"], ["r2", "🔥", "1182"]]);
    expect(state.storage.queued().filter((q) => q.to === "crane")).toEqual([]);
  });

  it("refuses a react without an id or with junk text, and a crane react without a human", async () => {
    const { crane, phone, say } = room();
    const pwa = phone("1182");

    await say(pwa, { kind: "react", text: "👍" });
    await say(pwa, { kind: "react", id: "r1", text: "x\u0000" });
    await say(crane, { kind: "react", id: "m1", text: "👍" });

    expect(pwa.frames()).toEqual([
      { kind: "error", text: "bad frame" },
      { kind: "error", text: "bad frame", id: "r1" },
    ]);
    expect(crane.frames()).toEqual([{ kind: "error", text: "bad frame", id: "m1" }]);
  });

  it("does not spend the crane's turn bucket on a react", async () => {
    const { crane, phone, say } = room();
    const pwa = phone("1182");
    await say(pwa, { id: "m1", text: "hi" });
    pwa.sent.length = 0;
    for (let i = 0; i < 40; i += 1) {
      await say(crane, { kind: "react", user_id: "1182", id: "m1", text: i % 2 ? "👍" : "❤️" });
    }
    expect(pwa.frames().every((f) => f.kind === "react")).toBe(true);
    expect(pwa.frames()).toHaveLength(40);
  });
});
