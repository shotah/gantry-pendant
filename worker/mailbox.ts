import { DurableObject } from "cloudflare:workers";
import { directoryApply, directoryRemember } from "../lib/auth/directory";
import { encodeFaceNotice, packAvatar, AVATAR_STORE_KEY, displaySlug, type StoredAvatar } from "../lib/avatar/store";
import {
  ALLOW_HASH_KEY,
  ALLOW_STORE_KEY,
  SLUG_STORE_KEY,
  allowHash,
  cranePublishedAllow,
  parseAllowUsers,
  parseStoredSlug,
  phoneMustNotPublishAllow,
  type RoomUser,
} from "../lib/mailbox/allow";
import { utf8Bytes } from "../lib/mailbox/caps";
import { cranePublishedCmds, CMDS_STORE_KEY, parseCommands, phoneMustNotPublishCmds } from "../lib/mailbox/cmds";
import { encodeFrame, parseFrame, stampOrderOnBody, stampReplayOnBody, stripClientOrder, type Role, type WireFrame } from "../lib/mailbox/frame";
import {
  cursorStoreKey,
  drainFor,
  enqueue,
  mergeCursor,
  newQueueId,
  peekFor,
  phoneMayDeleteQueued,
  pruneQueue,
  queuedFromList,
  queueIdentity,
  QUEUE_SEQ_KEY,
  queueStoreKey,
  QUEUE_STORE_PREFIX,
  seqForSince,
  shouldQueue,
  type Queued,
} from "../lib/mailbox/queue";
import {
  appendTranscript,
  asTranscript,
  hydrateTranscript,
  shouldTranscript,
  transcriptStoreKey,
} from "../lib/mailbox/transcript";
import { persistInboundForPhone, persistRole, resolvePhoneKind, routeTag } from "../lib/mailbox/route";
import { parseEmailVerified, parseExpMs, socketMessageAllowed } from "../lib/mailbox/socketAuth";
import { pruneDualLimits, takeFrame, type DualLimit } from "../lib/mailbox/rate";
import { cranePublishedDraft, phoneMustNotPublishDraft } from "../lib/mailbox/draft";
import { cranePublishedTyping, phoneMustNotPublishTyping } from "../lib/mailbox/typing";
import {
  collectTagged,
  openSockets,
  parseSocketTags,
  queueForCrane,
  roleTag,
  socketTags,
  type SocketMeta,
} from "../lib/mailbox/tags";
import { fanWebPush } from "../lib/push/fan";
import { sendWebPush } from "../lib/push/send";
import {
  dropPush,
  parsePushDelete,
  parsePushPut,
  prunePushForRoom,
  PUSH_STORE_PREFIX,
  pushStoreKey,
  upsertPush,
  type StoredPush,
} from "../lib/push/subscription";
import { readVapid } from "../lib/push/vapid";

const RATE_KEY = "rate";

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
    if (request.headers.get("X-Pendant-Op") === "push") {
      return this.pushHttp(request);
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
        await this.indexRoom(slug);
      }
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], socketTags({
      role,
      rateId,
      userId,
      expMs: parseExpMs(exp),
      email,
      emailVerified: parseEmailVerified(verified),
    }));
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
    const out: WireFrame = stripClientOrder(parsed.frame);
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
    const skipRate = cranePublishedDraft(meta.role, out.kind);
    if (!skipRate) {
      const limits = await this.take(meta.rateId, parsed.bytes);
      if (!limits) {
        ws.send(encodeFrame({ kind: "error", text: "rate" }));
        return;
      }
    }
    if (
      phoneMustNotPublishCmds(meta.role, out.kind)
      || phoneMustNotPublishAllow(meta.role, out.kind)
      || phoneMustNotPublishTyping(meta.role, out.kind)
      || phoneMustNotPublishDraft(meta.role, out.kind)
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
      for (const p of this.peers(roleTag("phone"))) {
        p.send(body);
      }
      return;
    }
    if (cranePublishedTyping(meta.role, out.kind)) {
      const tag = routeTag(meta.role, out);
      if (tag && out.user_id) {
        const body = encodeFrame({ kind: "typing", user_id: out.user_id });
        for (const p of this.peers(tag)) {
          p.send(body);
        }
      }
      return;
    }
    if (cranePublishedDraft(meta.role, out.kind)) {
      const tag = routeTag(meta.role, out);
      if (tag && out.user_id) {
        const body = encodeFrame({
          kind: "draft",
          user_id: out.user_id,
          text: out.text ?? "",
        });
        for (const p of this.peers(tag)) {
          p.send(body);
        }
      }
      return;
    }
    if (!out.id) {
      out.id = newQueueId();
    }
    if (meta.role === "crane" && out.kind === "ack") {
      if (out.id) {
        await this.deleteQueued({ id: out.id, to: "crane" });
      }
      return;
    }
    if (meta.role === "phone" && out.kind === "ack") {
      if (out.since) {
        await this.dropAckedThrough(out.since, meta.userId);
      }
      if (out.id) {
        await this.ackPhoneId(out.id, meta.userId);
      }
      for (const c of this.peers(roleTag("crane"))) {
        c.send(encodeFrame(out));
      }
      return;
    }
    if (shouldQueue(out.kind)) {
      out.seq = await this.nextSeq();
      out.at = now;
    }
    const body = encodeFrame(out);
    const tag = routeTag(meta.role, out);
    const peers = tag ? openSockets(this.peers(tag)) : [];
    const dest = persistRole(meta.role, out.kind, out.user_id);
    const phoneRow = (): Queued => ({
      id: out.id || newQueueId(),
      to: "phone",
      body,
      at: now,
      seq: out.seq,
      userId: out.user_id ?? "",
      kind: out.kind,
      bytes: utf8Bytes(body),
    });
    if (dest === "phone") {
      await this.rememberPhone(phoneRow());
      for (const p of peers) {
        p.send(body);
      }
      await this.notifyOffline(out);
      return;
    }
    if (dest === "crane") {
      if (peers.length) {
        for (const p of peers) {
          p.send(body);
        }
      }
      if (queueForCrane(peers.length)) {
        await this.putQueued({
          id: out.id,
          to: "crane",
          body,
          at: now,
          seq: out.seq,
          userId: out.user_id,
          kind: out.kind,
          bytes: utf8Bytes(body),
        });
      }
      if (persistInboundForPhone(meta.role, out.kind)) {
        await this.rememberPhone(phoneRow());
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

  async webSocketError(ws: WebSocket) {
    try {
      ws.close(1011, "error");
    } catch {
      // already closing
    }
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
    await this.ctx.storage.put(ALLOW_HASH_KEY, allowHash(users));
    const slug = parseStoredSlug(await this.ctx.storage.get<string>(SLUG_STORE_KEY));
    if (slug && this.env.DIRECTORY) {
      try {
        await directoryApply(this.env.DIRECTORY, slug, prev, users);
      } catch {
        // KV is an index, not the door
      }
    }
    for (const p of this.peers(roleTag("phone"))) {
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
    if (this.enforce()) {
      await this.prunePush(users);
    }
  }

  private async indexRoom(slug: string): Promise<void> {
    const users = await this.roomUsers();
    const hash = allowHash(users);
    const prev = await this.ctx.storage.get<string>(ALLOW_HASH_KEY);
    if (prev === hash) {
      return;
    }
    if (await directoryRemember(this.env.DIRECTORY, slug, users)) {
      await this.ctx.storage.put(ALLOW_HASH_KEY, hash);
    }
  }

  private peers(tag: string): WebSocket[] {
    return collectTagged((name) => this.ctx.getWebSockets(name), tag);
  }

  private meta(ws: WebSocket): SocketMeta {
    return parseSocketTags(this.ctx.getTags(ws));
  }

  private async flush(ws: WebSocket, role: Role, userId?: string) {
    if (role === "phone") {
      const cmds = await this.ctx.storage.get<string>(CMDS_STORE_KEY);
      if (cmds) {
        ws.send(cmds);
      }
      await this.sendTranscript(ws, userId);
      const items = await this.loadQueue();
      const cursor = userId ? await this.phoneCursor(userId) : 0;
      const take = peekFor(items, "phone", Date.now(), {
        userId,
        sinceSeq: cursor || undefined,
      });
      for (const m of take) {
        ws.send(stampOrderOnBody(m.body, { seq: m.seq, at: m.at }));
      }
      return;
    }
    const items = await this.loadQueue();
    const { take } = drainFor(items, "crane", Date.now());
    for (const m of take) {
      ws.send(stampOrderOnBody(m.body, { seq: m.seq, at: m.at }));
      await this.deleteQueued(m);
    }
  }

  private async rememberPhone(msg: Queued): Promise<void> {
    await this.putQueued(msg);
    await this.putTranscript(msg);
  }

  private async putTranscript(msg: Queued): Promise<void> {
    if (!shouldTranscript(msg.kind)) {
      return;
    }
    const key = transcriptStoreKey(msg.userId);
    const cur = asTranscript(await this.ctx.storage.get(key));
    const next = appendTranscript(cur, msg);
    await this.ctx.storage.put(key, next);
  }

  private async sendTranscript(ws: WebSocket, userId?: string): Promise<void> {
    const personal = userId
      ? asTranscript(await this.ctx.storage.get(transcriptStoreKey(userId)))
      : [];
    const broadcasts = asTranscript(await this.ctx.storage.get(transcriptStoreKey("")));
    for (const m of hydrateTranscript(personal, broadcasts)) {
      const ordered = stampOrderOnBody(m.body, { seq: m.seq, at: m.at });
      ws.send(stampReplayOnBody(ordered));
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
    const seq = msg.seq ?? await this.nextSeq();
    const queued = { ...msg, seq };
    const items = await this.loadQueue();
    const next = enqueue(items, queued, { now: Date.now() });
    const nextKeys = new Set(next.map((m) => queueIdentity(m)));
    for (const m of items) {
      if (!nextKeys.has(queueIdentity(m))) {
        await this.deleteQueued(m);
      }
    }
    if (nextKeys.has(queueIdentity(queued))) {
      const stored = next.find((m) => queueIdentity(m) === queueIdentity(queued)) ?? queued;
      await this.ctx.storage.put(queueStoreKey(queued.id, queued.to), stored);
    }
  }

  private async nextSeq(): Promise<number> {
    const n = (await this.ctx.storage.get<number>(QUEUE_SEQ_KEY)) ?? 0;
    const seq = n + 1;
    await this.ctx.storage.put(QUEUE_SEQ_KEY, seq);
    return seq;
  }

  private async phoneCursor(userId: string): Promise<number> {
    return (await this.ctx.storage.get<number>(cursorStoreKey(userId))) ?? 0;
  }

  private async bumpCursor(userId: string | undefined, ackSeq?: number): Promise<void> {
    if (!userId) {
      return;
    }
    const key = cursorStoreKey(userId);
    const cur = (await this.ctx.storage.get<number>(key)) ?? 0;
    const next = mergeCursor(cur, ackSeq);
    if (next !== cur) {
      await this.ctx.storage.put(key, next);
    }
  }

  private async deleteQueued(item: Pick<Queued, "id" | "to">): Promise<void> {
    await this.ctx.storage.delete(queueStoreKey(item.id, item.to));
    await this.ctx.storage.delete(QUEUE_STORE_PREFIX + item.id);
  }

  private async ackPhoneId(id: string, userId?: string): Promise<void> {
    const items = await this.loadQueue();
    const hit = items.find((m) => m.id === id && m.to === "phone");
    if (!hit || !phoneMayDeleteQueued(hit, userId)) {
      return;
    }
    await this.deleteQueued(hit);
    await this.bumpCursor(userId, hit.seq);
  }

  private async dropAckedThrough(since: string, userId?: string): Promise<void> {
    const items = await this.loadQueue();
    const sinceSeq = seqForSince(items, since);
    await this.bumpCursor(userId, sinceSeq);
    const uid = userId ?? "";
    for (const m of items) {
      if (!phoneMayDeleteQueued(m, uid)) {
        continue;
      }
      if (sinceSeq != null && m.seq != null) {
        if (m.seq <= sinceSeq) {
          await this.deleteQueued(m);
        }
        continue;
      }
      if (m.id <= since) {
        await this.deleteQueued(m);
      }
    }
  }

  private async pushHttp(request: Request): Promise<Response> {
    const userId = request.headers.get("X-Pendant-Sub")?.trim() ?? "";
    if (!userId) {
      return new Response("bad sub", { status: 400 });
    }
    const email = request.headers.get("X-Pendant-Email")?.trim() || undefined;
    const emailVerified = request.headers.get("X-Pendant-EmailVerified") === "1";
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return Response.json({ error: "bad frame" }, { status: 400 });
    }
    if (request.method === "PUT") {
      const parsed = parsePushPut(raw);
      if (!parsed) {
        return Response.json({ error: "bad frame" }, { status: 400 });
      }
      const mine = await this.loadPushFor(userId);
      const next = upsertPush(mine, {
        userId,
        email,
        emailVerified,
        subscription: parsed.subscription,
        at: Date.now(),
      });
      await this.writePush(userId, mine, next);
      return Response.json({ ok: true });
    }
    if (request.method === "DELETE") {
      const parsed = parsePushDelete(raw);
      if (!parsed) {
        return Response.json({ error: "bad frame" }, { status: 400 });
      }
      const mine = await this.loadPushFor(userId);
      const next = dropPush(mine, userId, parsed.endpoint);
      await this.writePush(userId, mine, next);
      return Response.json({ ok: true });
    }
    return new Response("method", { status: 405 });
  }

  private async notifyOffline(frame: WireFrame): Promise<void> {
    try {
      const vapid = readVapid(this.env);
      if (!vapid) {
        return;
      }
      const stored = await this.loadPushAll();
      const slug = parseStoredSlug(await this.ctx.storage.get<string>(SLUG_STORE_KEY)) ?? "";
      const { gone } = await fanWebPush({
        frame,
        title: displaySlug(slug),
        stored,
        send: (subscription, payload) => sendWebPush({
          vapid,
          subscription,
          payload,
          fetch: globalThis.fetch,
        }),
      });
      for (const row of gone) {
        await this.ctx.storage.delete(pushStoreKey(row.userId, row.subscription.endpoint));
      }
    } catch {
      // lock-screen is best-effort; the queue still holds the frame
    }
  }

  private async loadPushAll(): Promise<StoredPush[]> {
    const rows = await this.ctx.storage.list<StoredPush>({ prefix: PUSH_STORE_PREFIX });
    return [...rows.values()];
  }

  private async loadPushFor(userId: string): Promise<StoredPush[]> {
    const rows = await this.ctx.storage.list<StoredPush>({ prefix: `${PUSH_STORE_PREFIX}${userId}:` });
    return [...rows.values()];
  }

  private async writePush(userId: string, prev: StoredPush[], next: StoredPush[]): Promise<void> {
    const keep = new Set(next.map((row) => pushStoreKey(row.userId, row.subscription.endpoint)));
    for (const row of prev) {
      const key = pushStoreKey(row.userId, row.subscription.endpoint);
      if (!keep.has(key)) {
        await this.ctx.storage.delete(key);
      }
    }
    for (const row of next) {
      if (row.userId === userId) {
        await this.ctx.storage.put(pushStoreKey(row.userId, row.subscription.endpoint), row);
      }
    }
  }

  private async prunePush(users: RoomUser[]): Promise<void> {
    const all = await this.loadPushAll();
    const keep = prunePushForRoom(all, users, this.env.ALLOWED_SUBS);
    const keepKeys = new Set(keep.map((row) => pushStoreKey(row.userId, row.subscription.endpoint)));
    for (const row of all) {
      const key = pushStoreKey(row.userId, row.subscription.endpoint);
      if (!keepKeys.has(key)) {
        await this.ctx.storage.delete(key);
      }
    }
  }

  private async take(rateId: string, bytes: number): Promise<boolean> {
    const now = Date.now();
    const all = pruneDualLimits(
      (await this.ctx.storage.get<Record<string, DualLimit>>(RATE_KEY)) ?? {},
      now,
    );
    const got = takeFrame(all[rateId], now, bytes);
    all[rateId] = got.limits;
    await this.ctx.storage.put(RATE_KEY, all);
    return got.ok;
  }
}
