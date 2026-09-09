import { DurableObject } from "cloudflare:workers";
import { directoryApply, directoryRemember } from "../lib/auth/directory";
import { encodeFaceNotice, packAvatar, AVATAR_STORE_KEY, type StoredAvatar } from "../lib/avatar/store";
import {
  ALLOW_STORE_KEY,
  SLUG_STORE_KEY,
  cranePublishedAllow,
  parseAllowUsers,
  parseStoredSlug,
  phoneMustNotPublishAllow,
  type RoomUser,
} from "../lib/mailbox/allow";
import { utf8Bytes } from "../lib/mailbox/caps";
import { cranePublishedCmds, CMDS_STORE_KEY, parseCommands, phoneMustNotPublishCmds } from "../lib/mailbox/cmds";
import { encodeFrame, parseFrame, type Role, type WireFrame } from "../lib/mailbox/frame";
import {
  drainFor,
  enqueue,
  newQueueId,
  peekFor,
  pruneQueue,
  queuedFromList,
  queueIdentity,
  queueStoreKey,
  QUEUE_STORE_PREFIX,
  type Queued,
} from "../lib/mailbox/queue";
import { persistInboundForPhone, persistRole, resolvePhoneKind, routeTag } from "../lib/mailbox/route";
import { parseEmailVerified, parseExpMs, socketMessageAllowed } from "../lib/mailbox/socketAuth";
import { takeFrame, type DualLimit } from "../lib/mailbox/rate";
import { cranePublishedTyping, phoneMustNotPublishTyping } from "../lib/mailbox/typing";

const RATE_KEY = "rate";

type AttachMeta = {
  role: Role;
  rateId: string;
  userId?: string;
  email?: string;
  emailVerified?: boolean;
  expMs?: number;
};

export class Mailbox extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("X-Pendant-Op") === "avatar") {
      return this.avatarHttp(request);
    }
    if (request.headers.get("X-Pendant-Op") === "allow") {
      return this.allowHttp();
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const role = request.headers.get("X-Pendant-Role");
    const rateId = request.headers.get("X-Pendant-Rate") ?? "anon";
    const userId = request.headers.get("X-Pendant-Sub") ?? undefined;
    const email = request.headers.get("X-Pendant-Email") ?? undefined;
    const verified = request.headers.get("X-Pendant-EmailVerified") ?? "";
    const exp = request.headers.get("X-Pendant-Exp") ?? "";
    const slug = parseStoredSlug(request.headers.get("X-Pendant-Slug") ?? "");
    if (role !== "phone" && role !== "crane") {
      return new Response("bad role", { status: 400 });
    }
    if (slug) {
      await this.ctx.storage.put(SLUG_STORE_KEY, slug);
      if (role === "crane") {
        await directoryRemember(this.env.DIRECTORY, slug, await this.roomUsers());
      }
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [role, rateId, userId ?? "", exp, email ?? "", verified]);
    await this.flush(pair[1], role, userId);
    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const meta = this.meta(ws);
    const now = Date.now();
    const roomUsers = this.enforce() ? await this.roomUsers() : undefined;
    if (!socketMessageAllowed({
      role: meta.role,
      userId: meta.userId,
      email: meta.email,
      emailVerified: meta.emailVerified,
      expMs: meta.expMs,
      allowedSubs: this.env.ALLOWED_SUBS,
      roomUsers,
      enforce: this.enforce(),
      now,
    })) {
      ws.close(4401, "unauthorized");
      return;
    }
    const parsed = parseFrame(message, { role: meta.role });
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
      const kind = resolvePhoneKind(out);
      if (!kind) {
        ws.send(encodeFrame({ kind: "error", text: "bad frame" }));
        return;
      }
      out.kind = kind;
      if (meta.userId) {
        out.user_id = meta.userId;
      }
      if (meta.email && meta.emailVerified) {
        out.email = meta.email;
      } else {
        delete out.email;
      }
    } else if (!out.kind) {
      out.kind = "reply";
    }
    if (
      phoneMustNotPublishCmds(meta.role, out.kind)
      || phoneMustNotPublishAllow(meta.role, out.kind)
      || phoneMustNotPublishTyping(meta.role, out.kind)
    ) {
      ws.send(encodeFrame({ kind: "error", text: "bad frame" }));
      return;
    }
    if (cranePublishedAllow(meta.role, out.kind)) {
      await this.storeAllow(parseAllowUsers(out.users), now);
      return;
    }
    if (cranePublishedCmds(meta.role, out.kind)) {
      const body = encodeFrame({ kind: "cmds", commands: parseCommands(out.commands) });
      await this.ctx.storage.put(CMDS_STORE_KEY, body);
      for (const p of this.ctx.getWebSockets("phone")) {
        p.send(body);
      }
      return;
    }
    if (cranePublishedTyping(meta.role, out.kind)) {
      const tag = routeTag(meta.role, out);
      if (tag && out.user_id) {
        const body = encodeFrame({ kind: "typing", user_id: out.user_id });
        for (const p of this.ctx.getWebSockets(tag)) {
          p.send(body);
        }
      }
      return;
    }
    if (!out.id) {
      out.id = newQueueId();
    }
    if (meta.role === "phone" && out.kind === "ack") {
      if (out.since) {
        await this.dropAckedThrough(out.since, meta.userId);
      }
      await this.deleteQueued({ id: out.id, to: "phone" });
      const cranes = this.ctx.getWebSockets("crane");
      for (const c of cranes) {
        c.send(encodeFrame(out));
      }
      return;
    }
    const body = encodeFrame(out);
    const tag = routeTag(meta.role, out);
    const peers = tag ? this.ctx.getWebSockets(tag) : [];
    const dest = persistRole(meta.role, out.kind, out.user_id);
    if (dest === "phone") {
      await this.putQueued({
        id: out.id,
        to: "phone",
        body,
        at: now,
        userId: out.user_id ?? "",
        kind: out.kind,
        bytes: utf8Bytes(body),
      });
      for (const p of peers) {
        p.send(body);
      }
      return;
    }
    if (dest === "crane") {
      if (peers.length) {
        for (const p of peers) {
          p.send(body);
        }
      } else {
        await this.putQueued({
          id: out.id,
          to: "crane",
          body,
          at: now,
          userId: out.user_id,
          kind: out.kind,
          bytes: utf8Bytes(body),
        });
      }
      if (persistInboundForPhone(meta.role, out.kind)) {
        await this.putQueued({
          id: out.id,
          to: "phone",
          body,
          at: now,
          userId: out.user_id ?? "",
          kind: out.kind,
          bytes: utf8Bytes(body),
        });
      }
      if (meta.role === "phone" && out.kind === "inbound") {
        ws.send(encodeFrame({ kind: "ack", id: out.id }));
      }
      return;
    }
    for (const p of peers) {
      p.send(body);
    }
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

  private async allowHttp(): Promise<Response> {
    return Response.json({ users: await this.roomUsers() });
  }

  private enforce(): boolean {
    return Boolean(this.env.GOOGLE_CLIENT_ID?.trim());
  }

  private async roomUsers(): Promise<RoomUser[]> {
    const stored = await this.ctx.storage.get<RoomUser[]>(ALLOW_STORE_KEY);
    return Array.isArray(stored) ? stored : [];
  }

  private async storeAllow(users: RoomUser[], now: number): Promise<void> {
    const prev = await this.roomUsers();
    await this.ctx.storage.put(ALLOW_STORE_KEY, users);
    const slug = parseStoredSlug(await this.ctx.storage.get<string>(SLUG_STORE_KEY));
    if (slug && this.env.DIRECTORY) {
      await directoryApply(this.env.DIRECTORY, slug, prev, users);
    }
    for (const p of this.ctx.getWebSockets("phone")) {
      const phone = this.meta(p);
      if (!socketMessageAllowed({
        role: "phone",
        userId: phone.userId,
        email: phone.email,
        emailVerified: phone.emailVerified,
        expMs: phone.expMs,
        allowedSubs: this.env.ALLOWED_SUBS,
        roomUsers: users,
        enforce: this.enforce(),
        now,
      })) {
        p.close(4401, "unauthorized");
      }
    }
  }

  private meta(ws: WebSocket): AttachMeta {
    const tags = this.ctx.getTags(ws);
    const role = tags[0] === "crane" ? "crane" : "phone";
    return {
      role,
      rateId: tags[1] || "anon",
      userId: tags[2] || undefined,
      expMs: parseExpMs(tags[3]),
      email: tags[4] || undefined,
      emailVerified: parseEmailVerified(tags[5]),
    };
  }

  private async flush(ws: WebSocket, role: Role, userId?: string) {
    if (role === "phone") {
      const cmds = await this.ctx.storage.get<string>(CMDS_STORE_KEY);
      if (cmds) {
        ws.send(cmds);
      }
    }
    const items = await this.loadQueue();
    if (role === "phone") {
      const take = peekFor(items, "phone", Date.now(), { userId });
      for (const m of take) {
        ws.send(m.body);
      }
      return;
    }
    const { take } = drainFor(items, "crane", Date.now());
    for (const m of take) {
      ws.send(m.body);
      await this.deleteQueued(m);
    }
  }

  private async loadQueue(): Promise<Queued[]> {
    const rows = await this.ctx.storage.list<Queued>({ prefix: QUEUE_STORE_PREFIX });
    const all = queuedFromList(rows);
    const now = Date.now();
    const live = pruneQueue(all, now);
    if (live.length !== all.length) {
      const keep = new Set(live.map((m) => queueIdentity(m)));
      for (const [key, m] of rows) {
        if (!keep.has(queueIdentity(m))) {
          await this.ctx.storage.delete(key);
        }
      }
    }
    return live;
  }

  private async putQueued(msg: Queued): Promise<void> {
    const items = await this.loadQueue();
    const next = enqueue(items, msg, { now: Date.now() });
    const nextKeys = new Set(next.map((m) => queueIdentity(m)));
    for (const m of items) {
      if (!nextKeys.has(queueIdentity(m))) {
        await this.deleteQueued(m);
      }
    }
    if (nextKeys.has(queueIdentity(msg))) {
      const stored = next.find((m) => queueIdentity(m) === queueIdentity(msg)) ?? msg;
      await this.ctx.storage.put(queueStoreKey(msg.id, msg.to), stored);
    }
  }

  private async deleteQueued(item: Pick<Queued, "id" | "to">): Promise<void> {
    await this.ctx.storage.delete(queueStoreKey(item.id, item.to));
    await this.ctx.storage.delete(QUEUE_STORE_PREFIX + item.id);
  }

  private async dropAckedThrough(since: string, userId?: string): Promise<void> {
    const items = await this.loadQueue();
    const uid = userId ?? "";
    for (const m of items) {
      if (m.to === "phone" && (m.userId ?? "") === uid && m.id <= since) {
        await this.deleteQueued(m);
      }
    }
  }

  private async take(rateId: string, bytes: number): Promise<boolean> {
    const all = (await this.ctx.storage.get<Record<string, DualLimit>>(RATE_KEY)) ?? {};
    const got = takeFrame(all[rateId], Date.now(), bytes);
    all[rateId] = got.limits;
    await this.ctx.storage.put(RATE_KEY, all);
    return got.ok;
  }
}
