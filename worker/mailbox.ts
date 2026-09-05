import { DurableObject } from "cloudflare:workers";
import { encodeFaceNotice, packAvatar, AVATAR_STORE_KEY, type StoredAvatar } from "../lib/avatar/store";
import { encodeFrame, parseFrame, peerOf, type Role, type WireFrame } from "../lib/mailbox/frame";
import { cranePublishedCmds, CMDS_STORE_KEY, parseCommands, phoneMustNotPublishCmds } from "../lib/mailbox/cmds";
import { drainFor, enqueue, newQueueId, type Queued } from "../lib/mailbox/queue";
import { takeFrame, type DualLimit } from "../lib/mailbox/rate";

const QUEUE_KEY = "queue";
const RATE_KEY = "rate";

type AttachMeta = { role: Role; rateId: string; userId?: string };

export class Mailbox extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("X-Pendant-Op") === "avatar") {
      return this.avatarHttp(request);
    }
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
    if (phoneMustNotPublishCmds(meta.role, out.kind)) {
      ws.send(encodeFrame({ kind: "error", text: "bad frame" }));
      return;
    }
    if (meta.role === "phone") {
      out.kind = out.kind ?? (out.text || out.images?.length ? "inbound" : "pin");
      if (meta.userId) {
        out.user_id = meta.userId;
      }
    } else if (!out.kind) {
      out.kind = "reply";
    }
    if (cranePublishedCmds(meta.role, out.kind)) {
      const body = encodeFrame({ kind: "cmds", commands: parseCommands(out.commands) });
      await this.ctx.storage.put(CMDS_STORE_KEY, body);
      for (const p of this.ctx.getWebSockets("phone")) {
        p.send(body);
      }
      return;
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

  private async avatarHttp(request: Request): Promise<Response> {
    if (request.method === "GET") {
      const hit = await this.ctx.storage.get<StoredAvatar>(AVATAR_STORE_KEY);
      if (!hit) {
        return new Response(null, { status: 404 });
      }
      return new Response(hit.jpeg, {
        headers: {
          "Content-Type": "image/jpeg",
          "X-Pendant-Rev": String(hit.rev),
          "Cache-Control": "private, max-age=0, must-revalidate",
        },
      });
    }
    if (request.method === "PUT" || request.method === "POST") {
      const bytes = new Uint8Array(await request.arrayBuffer());
      const packed = packAvatar(bytes, Date.now());
      if (!packed.ok) {
        return Response.json({ error: packed.detail }, { status: 400 });
      }
      await this.ctx.storage.put(AVATAR_STORE_KEY, packed.stored);
      const notice = encodeFaceNotice(packed.stored.rev);
      for (const sock of this.ctx.getWebSockets()) {
        sock.send(notice);
      }
      return Response.json({ ok: true, rev: packed.stored.rev, detail: "saved avatar.jpg" });
    }
    return new Response("method", { status: 405 });
  }

  private meta(ws: WebSocket): AttachMeta {
    const tags = this.ctx.getTags(ws);
    const role = tags[0] === "crane" ? "crane" : "phone";
    return { role, rateId: tags[1] || "anon", userId: tags[2] || undefined };
  }

  private async flush(ws: WebSocket, role: Role) {
    if (role === "phone") {
      const cmds = await this.ctx.storage.get<string>(CMDS_STORE_KEY);
      if (cmds) {
        ws.send(cmds);
      }
    }
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
