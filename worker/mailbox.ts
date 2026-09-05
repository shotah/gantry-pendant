import { DurableObject } from "cloudflare:workers";
import { encodeFrame, parseFrame, peerOf, type Role, type WireFrame } from "../lib/mailbox/frame";
import { drainFor, enqueue, newQueueId, type Queued } from "../lib/mailbox/queue";
import { takeFrame, type DualLimit } from "../lib/mailbox/rate";

const QUEUE_KEY = "queue";
const RATE_KEY = "rate";

type AttachMeta = { role: Role; rateId: string; userId?: string };

export class Mailbox extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const role = request.headers.get("X-Pendant-Role");
    const rateId = request.headers.get("X-Pendant-Rate") ?? "anon";
    const userId = request.headers.get("X-Pendant-Sub") ?? undefined;
    if (role !== "phone" && role !== "crane") {
      return new Response("bad role", { status: 400 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [role, rateId, userId ?? ""]);
    await this.flush(pair[1], role);
    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const meta = this.meta(ws);
    const parsed = parseFrame(message);
    if (!parsed.ok) {
      ws.send(encodeFrame({ kind: "error", text: parsed.error }));
      return;
    }
    const limits = await this.take(meta.rateId, parsed.bytes);
    if (!limits) {
      ws.send(encodeFrame({ kind: "error", text: "rate" }));
      return;
    }
    const out: WireFrame = { ...parsed.frame };
    if (meta.role === "phone") {
      out.kind = out.kind ?? (out.text || out.images?.length ? "inbound" : "pin");
      if (meta.userId) {
        out.user_id = meta.userId;
      }
    } else if (!out.kind) {
      out.kind = "reply";
    }
    const body = encodeFrame(out);
    const peer = peerOf(meta.role);
    const peers = this.ctx.getWebSockets(peer);
    if (peers.length) {
      for (const p of peers) {
        p.send(body);
      }
      return;
    }
    const items = await this.loadQueue();
    const next = enqueue(items, {
      id: newQueueId(),
      to: peer,
      body,
      at: Date.now(),
    }, { now: Date.now() });
    await this.ctx.storage.put(QUEUE_KEY, next);
  }

  async webSocketClose() {
    // Hibernation keeps tags; nothing to log (bodies stay off the wire logs).
  }

  private meta(ws: WebSocket): AttachMeta {
    const tags = this.ctx.getTags(ws);
    const role = tags[0] === "crane" ? "crane" : "phone";
    return { role, rateId: tags[1] || "anon", userId: tags[2] || undefined };
  }

  private async flush(ws: WebSocket, role: Role) {
    const items = await this.loadQueue();
    const { kept, take } = drainFor(items, role, Date.now());
    for (const m of take) {
      ws.send(m.body);
    }
    await this.ctx.storage.put(QUEUE_KEY, kept);
  }

  private async loadQueue(): Promise<Queued[]> {
    return (await this.ctx.storage.get<Queued[]>(QUEUE_KEY)) ?? [];
  }

  private async take(rateId: string, bytes: number): Promise<boolean> {
    const all = (await this.ctx.storage.get<Record<string, DualLimit>>(RATE_KEY)) ?? {};
    const got = takeFrame(all[rateId], Date.now(), bytes);
    all[rateId] = got.limits;
    await this.ctx.storage.put(RATE_KEY, all);
    return got.ok;
  }
}
