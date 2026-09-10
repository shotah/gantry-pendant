"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FontSelect } from "../shared/FontSelect";
import { ThemeSelect } from "../shared/ThemeSelect";
import type { SlashCommand } from "@/app/lib/slash";
import { Compose } from "./Compose";
import { ConfigGapNote } from "./ConfigGapNote";
import { InstallApp } from "./InstallApp";
import { KitAvatar } from "./KitAvatar";
import { NotifyEnable } from "./NotifyEnable";
import { SettingsMenu } from "./SettingsMenu";
import { bubbleFrom, Thread, type ChatBubble } from "./Thread";
import { mailboxUrl, parseIncoming } from "@/app/lib/socket";
import { capThread, rememberSeen } from "@/app/lib/thread";
import { browserBattery } from "@/app/lib/battery";
import { browserBumpBadge, browserClearBadge } from "@/app/lib/badge";
import { browserGeo } from "@/app/lib/geo";
import { browserBuzzPush } from "@/app/lib/haptic";
import { browserNet } from "@/app/lib/net";
import { browserNotifyIncoming } from "@/app/lib/notify";
import { browserSubscribePush } from "@/app/lib/push";
import { fileToPhoto } from "@/app/lib/photo";
import { browserGeoPref, saveGeoPref } from "@/app/lib/prefs";
import { applyFont, fontFromQuery } from "@/app/lib/font";
import { applyTheme, themeFromQuery } from "@/app/lib/theme";
import { browserWakeLock, releaseScreenWake, type WakeLockSentinel } from "@/app/lib/wake";
import type { ConfigGap } from "@/lib/auth/mode";
import { displaySlug, faceRevFromUnknown } from "@/lib/avatar/store";
import { parseSlug } from "@/lib/mailbox/slug";
import { buildContext } from "@/lib/phone/context";
import { GEO_TIMEOUT_MS, GEO_WARM_MS, cachedGeo, geoHint } from "@/lib/phone/geo";
import { recoverViewport, viewportShellHeight } from "@/lib/phone/viewport";
import { encodeFrame, type Role, type WireFrame } from "@/lib/mailbox/frame";
import { clearsTyping, TYPING_TTL_MS } from "@/lib/mailbox/typing";
import { nextMockReply, parseSample, sampleScene, type SampleId } from "@/lib/dev/samples";

type AuthCfg = {
  mode: "spike" | "oidc" | null;
  google: boolean;
  dev?: boolean;
  gap?: ConfigGap | null;
};
type Me = { sub: string; email?: string; cranes?: string[] } | null;

const BACKOFF_MS = 1000;
const BACKOFF_MAX = 30_000;
const ME_POLL_MS = 15_000;
const ME_POLL_MAX = 60_000;
const DRAFT_BUBBLE_ID = "__draft__";

type ClientFrame = {
  id?: string;
  since?: string;
  kind?: string;
  text?: string;
  images?: { url: string }[];
  context?: unknown;
};

function clientFrameId(frame: object): string | undefined {
  if (!("id" in frame)) {
    return undefined;
  }
  const id = frame.id;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function mintFrameId(n: number): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${n}`;
}

function sendClientFrame(ws: WebSocket, frame: ClientFrame): void {
  ws.send(encodeFrame(frame as WireFrame));
}

export function PhoneShell({ role = "phone" }: { role?: Role }) {
  const [slug, setSlug] = useState("kit");
  const [slugTouched, setSlugTouched] = useState(false);
  const [secret, setSecret] = useState("");
  const [bearer, setBearer] = useState("");
  const [cfg, setCfg] = useState<AuthCfg | null>(null);
  const [me, setMe] = useState<Me>(null);
  const [sampleId, setSampleId] = useState<SampleId | null>(null);
  const [status, setStatus] = useState<"idle" | "up" | "down">("idle");
  const [gpsHint, setGpsHint] = useState("GPS attaches on send if the OS allows it.");
  const [gpsOn, setGpsOn] = useState(true);
  const [prefsReady, setPrefsReady] = useState(false);
  const [messages, setMessagesRaw] = useState<ChatBubble[]>([]);
  const [draft, setDraft] = useState("");
  const [sampleEmoji, setSampleEmoji] = useState(false);
  const [catalog, setCatalog] = useState<SlashCommand[]>([]);
  const [avatarRev, setAvatarRev] = useState(0);
  const [faceHint, setFaceHint] = useState("");
  const [copied, setCopied] = useState(false);
  const [meWait, setMeWait] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const echoTimer = useRef(0);
  const echoCount = useRef(0);
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const badgeRef = useRef(0);
  const pinConsumed = useRef(false);
  const sendPinRef = useRef<() => Promise<void>>(async () => {});
  const stoppedRef = useRef(true);
  const connectGen = useRef(0);
  const backoffRef = useRef(BACKOFF_MS);
  const reconnectTimer = useRef(0);
  const lastSeenId = useRef<string | undefined>(undefined);
  const seenIds = useRef(new Set<string>());
  const idSeq = useRef(0);
  const [typing, setTyping] = useState(false);
  const typingTimer = useRef(0);
  const gpsOnRef = useRef(true);
  const geoWarm = useRef(false);
  const phone = role === "phone";
  const painting = Boolean(cfg?.dev && sampleId);
  const localEcho = Boolean(cfg?.dev && !sampleId && phone);

  function setMessages(update: ChatBubble[] | ((prev: ChatBubble[]) => ChatBubble[])) {
    if (typeof update === "function") {
      setMessagesRaw((prev) => capThread(update(prev)));
      return;
    }
    setMessagesRaw(capThread(update));
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setSampleId(parseSample(q.get("sample")));
    const fromQuery = parseSlug(q.get("slug") ?? "");
    if (fromQuery) {
      setSlug(fromQuery);
      setSlugTouched(true);
    }
    const theme = themeFromQuery(q.get("theme"));
    if (theme) {
      applyTheme(theme);
    }
    const font = fontFromQuery(q.get("font"));
    if (font) {
      applyFont(font);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const [c, m] = await Promise.all([
        fetch("/api/auth/config").then((r) => r.json() as Promise<AuthCfg>).catch(() => null),
        fetch("/api/auth/me").then(async (r) => r.ok ? r.json() as Promise<Me> : null).catch(() => null),
      ]);
      if (c) {
        setCfg(c);
      }
      setMe(m);
    })();
  }, []);

  useEffect(() => {
    if (!phone || cfg?.mode !== "oidc" || !me?.cranes?.length) {
      return;
    }
    const cranes = me.cranes;
    setSlug((cur) => {
      if (cranes.includes(cur)) {
        return cur;
      }
      if (slugTouched) {
        return cur;
      }
      return cranes[0] ?? cur;
    });
  }, [cfg?.mode, me, phone, slugTouched]);

  useEffect(() => {
    if (!cfg?.dev || !sampleId) {
      return;
    }
    const scene = sampleScene(sampleId, role);
    setMessages(scene.messages);
    setStatus(scene.status);
    setDraft(scene.draft ?? "");
    setCatalog(scene.catalog ?? []);
    setTyping(Boolean(scene.typing));
    setSampleEmoji(Boolean(scene.emoji));
    if (scene.gpsHint) {
      setGpsHint(scene.gpsHint);
    }
  }, [cfg?.dev, sampleId, role]);

  useEffect(() => {
    scroller.current?.scrollTo?.({ top: scroller.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    setAvatarRev(0);
    setFaceHint("");
  }, [slug]);

  useEffect(() => {
    if (!phone) {
      setPrefsReady(true);
      return;
    }
    const on = browserGeoPref();
    gpsOnRef.current = on;
    setGpsOn(on);
    if (!on) {
      setGpsHint("GPS off");
    }
    setPrefsReady(true);
  }, [phone]);

  useEffect(() => {
    return () => {
      window.clearTimeout(echoTimer.current);
      window.clearTimeout(typingTimer.current);
      void releaseScreenWake(wakeRef.current);
    };
  }, []);

  useEffect(() => {
    if (!phone) {
      return;
    }
    function onVis() {
      if (document.hidden) {
        void releaseScreenWake(wakeRef.current);
        wakeRef.current = null;
      } else {
        badgeRef.current = browserClearBadge();
        recoverViewport(window);
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phone]);

  useEffect(() => {
    if (!phone || typeof window === "undefined" || !window.visualViewport) {
      return;
    }
    const vv = window.visualViewport;
    function sync() {
      recoverViewport(window);
      const node = shellRef.current;
      const height = viewportShellHeight(vv.height);
      if (node && height) {
        node.style.height = height;
      }
    }
    sync();
    const el = shellRef.current;
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      if (el) {
        el.style.height = "";
      }
    };
  }, [phone]);

  const cranes = me?.cranes ?? [];
  const roomSlug = (() => {
    if (!cfg) {
      return "";
    }
    if (!phone || cfg.mode !== "oidc" || cfg.dev) {
      return slug;
    }
    if (cranes.includes(slug)) {
      return slug;
    }
    if (slugTouched) {
      return slug;
    }
    return cranes[0] ?? "";
  })();
  const mailboxGap = Boolean(phone && cfg?.gap && !cfg.dev);
  const needGoogle = Boolean(
    phone && !mailboxGap && (
      (cfg?.dev && sampleId === "unsigned")
      || (Boolean(cfg?.google) && !me && !cfg?.dev)
    ),
  );
  const listed = !phone || cfg?.mode !== "oidc" || Boolean(cfg.dev)
    || cranes.includes(roomSlug);
  const waitingForCrane = Boolean(
    phone && cfg?.mode === "oidc" && !cfg.dev && me && !listed,
  );
  const canSocket = Boolean(cfg && roomSlug && listed && (cfg.mode === "spike" ? secret : phone ? me : bearer));

  useEffect(() => {
    if (!phone || cfg?.mode !== "oidc" || !me || !listed || !roomSlug || needGoogle || mailboxGap || waitingForCrane) {
      return;
    }
    void browserSubscribePush(roomSlug);
  }, [phone, cfg?.mode, me, listed, roomSlug, needGoogle, mailboxGap, waitingForCrane]);

  useEffect(() => {
    if (!phone || cfg?.mode !== "oidc" || cfg.dev || listed || !me) {
      return;
    }
    let dead = false;
    let delay = ME_POLL_MS;
    let timer = 0;
    const load = () => {
      const want = parseSlug(slug);
      const q = want && slugTouched ? `?slug=${encodeURIComponent(want)}` : "";
      void fetch(`/api/auth/me${q}`)
        .then(async (r) => {
          if (r.status === 429) {
            setMeWait(true);
            delay = Math.min(delay * 2, ME_POLL_MAX);
            return null;
          }
          setMeWait(false);
          delay = ME_POLL_MS;
          return r.ok ? r.json() as Promise<Me> : null;
        })
        .then((m) => {
          if (dead || !m) {
            return;
          }
          setMe((prev) => {
            if (
              prev
              && prev.sub === m.sub
              && prev.email === m.email
              && JSON.stringify(prev.cranes ?? []) === JSON.stringify(m.cranes ?? [])
            ) {
              return prev;
            }
            return m;
          });
        })
        .catch(() => undefined)
        .finally(() => {
          if (dead) {
            return;
          }
          timer = window.setTimeout(load, delay);
        });
    };
    load();
    return () => {
      dead = true;
      window.clearTimeout(timer);
    };
  }, [cfg?.dev, cfg?.mode, listed, me, phone, slug, slugTouched]);

  const connect = useCallback(() => {
    if (stoppedRef.current || typeof window === "undefined" || !canSocket) {
      return;
    }
    window.clearTimeout(reconnectTimer.current);
    reconnectTimer.current = 0;
    connectGen.current += 1;
    const gen = connectGen.current;
    const prev = wsRef.current;
    wsRef.current = null;
    if (prev) {
      prev.onopen = null;
      prev.onclose = null;
      prev.onerror = null;
      prev.onmessage = null;
      prev.close();
    }
    const url = mailboxUrl({
      host: window.location.host,
      protocol: window.location.protocol,
      slug: roomSlug,
      role,
      secret: cfg?.mode === "spike" ? secret : undefined,
      bearer: !phone && cfg?.mode === "oidc" ? bearer : undefined,
    });
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => {
      if (gen !== connectGen.current || stoppedRef.current) {
        return;
      }
      backoffRef.current = BACKOFF_MS;
      setStatus("up");
      const since = lastSeenId.current;
      if (since) {
        sendClientFrame(ws, { kind: "ack", since });
      }
    };
    ws.onclose = () => {
      if (gen !== connectGen.current || stoppedRef.current) {
        return;
      }
      setStatus("down");
      setTyping(false);
      setMessages((prev) => prev.filter((m) => m.id !== DRAFT_BUBBLE_ID));
      window.clearTimeout(typingTimer.current);
      typingTimer.current = 0;
      void releaseScreenWake(wakeRef.current);
      wakeRef.current = null;
      window.clearTimeout(reconnectTimer.current);
      const delay = backoffRef.current;
      backoffRef.current = Math.min(delay * 2, BACKOFF_MAX);
      reconnectTimer.current = window.setTimeout(() => {
        if (stoppedRef.current) {
          return;
        }
        connect();
      }, delay);
    };
    ws.onmessage = (ev) => {
      if (gen !== connectGen.current || stoppedRef.current) {
        return;
      }
      const frame = parseIncoming(String(ev.data));
      if (!frame) {
        return;
      }
      const face = faceRevFromUnknown(frame);
      if (face) {
        setAvatarRev(face);
        return;
      }
      if (frame.kind === "cmds") {
        setCatalog(frame.commands ?? []);
        return;
      }
      if (frame.kind === "typing") {
        if (phone) {
          setTyping(true);
          window.clearTimeout(typingTimer.current);
          typingTimer.current = window.setTimeout(() => {
            setTyping(false);
            typingTimer.current = 0;
          }, TYPING_TTL_MS);
        }
        return;
      }
      if (frame.kind === "draft") {
        if (!phone) {
          return;
        }
        const text = frame.text ?? "";
        setMessages((prev) => {
          const rest = prev.filter((m) => m.id !== DRAFT_BUBBLE_ID);
          if (!text.trim()) {
            return rest;
          }
          return [
            ...rest,
            {
              id: DRAFT_BUBBLE_ID,
              from: "kit",
              text,
              kind: "draft",
              at: Date.now(),
            },
          ];
        });
        return;
      }
      if (phone && clearsTyping(frame.kind)) {
        setTyping(false);
        window.clearTimeout(typingTimer.current);
        typingTimer.current = 0;
      }
      const id = clientFrameId(frame);
      if (frame.kind === "ack") {
        if (id) {
          setMessages((prev) => prev.map((m) => (
            m.id === id ? { ...m, pending: false } : m
          )));
        }
        return;
      }
      if (id) {
        lastSeenId.current = id;
        if (seenIds.current.has(id)) {
          return;
        }
        rememberSeen(seenIds.current, id);
      }
      setMessages((prev) => {
        const rest = frame.kind === "reply"
          ? prev.filter((m) => m.id !== DRAFT_BUBBLE_ID)
          : prev;
        return [
          ...rest,
          {
            id: id ?? `${Date.now()}-${rest.length}`,
            from: bubbleFrom(phone, frame.kind),
            text: frame.text ?? "",
            kind: frame.kind,
            at: Date.now(),
            photo: frame.images?.[0]?.url,
          },
        ];
      });
      if (phone) {
        void releaseScreenWake(wakeRef.current);
        wakeRef.current = null;
        browserBuzzPush(frame.kind);
        badgeRef.current = browserBumpBadge(badgeRef.current, frame.kind);
        browserNotifyIncoming({
          kind: frame.kind,
          title: displaySlug(roomSlug),
          text: frame.text,
          photo: Boolean(frame.images?.[0]?.url),
        });
      }
    };
  }, [bearer, canSocket, cfg?.mode, phone, role, roomSlug, secret]);

  useEffect(() => {
    if (!canSocket || painting) {
      return;
    }
    stoppedRef.current = false;
    backoffRef.current = BACKOFF_MS;
    connect();
    function onVis() {
      if (document.visibilityState !== "visible" || stoppedRef.current) {
        return;
      }
      const sock = wsRef.current;
      if (sock && sock.readyState === WebSocket.OPEN) {
        return;
      }
      connect();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stoppedRef.current = true;
      document.removeEventListener("visibilitychange", onVis);
      window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = 0;
      connectGen.current += 1;
      const sock = wsRef.current;
      wsRef.current = null;
      if (sock) {
        sock.onopen = null;
        sock.onclose = null;
        sock.onerror = null;
        sock.onmessage = null;
        sock.close();
      }
    };
  }, [canSocket, connect, painting]);

  useEffect(() => {
    if (painting || canSocket || !localEcho) {
      return;
    }
    setStatus("up");
  }, [painting, canSocket, localEcho]);

  useEffect(() => {
    if (!phone || painting || !prefsReady || status !== "up" || pinConsumed.current) {
      return;
    }
    const q = new URLSearchParams(window.location.search);
    if (q.get("pin") !== "1") {
      return;
    }
    pinConsumed.current = true;
    q.delete("pin");
    const qs = q.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
    void sendPinRef.current();
  }, [phone, painting, prefsReady, status]);

  async function dropWake() {
    await releaseScreenWake(wakeRef.current);
    wakeRef.current = null;
  }

  async function takeWake() {
    await dropWake();
    wakeRef.current = await browserWakeLock();
  }

  async function warmGps() {
    if (!phone || !gpsOnRef.current || geoWarm.current) {
      return;
    }
    geoWarm.current = true;
    const geo = await browserGeo(GEO_WARM_MS);
    if (!gpsOnRef.current) {
      geoWarm.current = false;
      return;
    }
    if (!geo.ok && geo.reason === "unavailable") {
      geoWarm.current = false;
    }
    setGpsHint(geoHint(true, geo));
  }

  async function phoneContext(wantGeo: boolean, opts?: { timeoutMs?: number; cachedOnly?: boolean }) {
    const timeoutMs = opts?.timeoutMs ?? GEO_TIMEOUT_MS;
    let geo: Awaited<ReturnType<typeof browserGeo>>;
    if (!wantGeo) {
      geo = { ok: false, reason: "unavailable" };
    } else if (opts?.cachedOnly) {
      const hit = cachedGeo();
      geo = hit ? { ok: true, geo: hit } : { ok: false, reason: "unavailable" };
    } else {
      geo = await browserGeo(timeoutMs);
    }
    const battery = await browserBattery();
    return {
      geo,
      context: buildContext({
        geo: geo.ok ? geo.geo : null,
        battery: battery.ok ? battery.battery : null,
        net: browserNet(),
      }),
    };
  }

  async function sendText(text: string, photo?: string) {
    const wantGeo = phone && gpsOn;
    const trimmed = text.trim();
    const waitAck = canSocket && !painting;
    const outbound = Boolean(trimmed || photo);
    if (outbound) {
      idSeq.current += 1;
    }
    const id = outbound ? mintFrameId(idSeq.current) : undefined;
    if (id) {
      rememberSeen(seenIds.current, id);
    }
    if (outbound && id) {
      setMessages((prev) => [
        ...prev,
        {
          id,
          from: phone ? "you" : "kit",
          text: trimmed,
          at: Date.now(),
          photo,
          pending: waitAck ? true : undefined,
        },
      ]);
    }
    if (phone) {
      recoverViewport(window);
    }
    const { geo, context } = phone
      ? await phoneContext(wantGeo, { cachedOnly: true })
      : { geo: { ok: false as const, reason: "unavailable" as const }, context: undefined };
    if (phone) {
      if (!wantGeo || geo.ok || !geoWarm.current) {
        setGpsHint(geoHint(wantGeo, geo));
      }
      badgeRef.current = browserClearBadge();
      void takeWake();
    }
    const frame: ClientFrame = {
      id,
      text: trimmed || undefined,
      kind: phone ? "inbound" : "reply",
      images: photo ? [{ url: photo }] : undefined,
      context,
    };
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      sendClientFrame(wsRef.current, frame);
    }
    if (localEcho && !canSocket && !painting && (trimmed || photo)) {
      const n = echoCount.current;
      echoCount.current += 1;
      window.clearTimeout(echoTimer.current);
      echoTimer.current = window.setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-echo`,
            from: "kit",
            text: nextMockReply(n),
            at: Date.now(),
          },
        ]);
        void dropWake();
      }, 400);
    }
  }

  async function sendPin() {
    if (!phone || !gpsOn) {
      if (phone && !gpsOn) {
        setGpsHint("GPS off");
      }
      return;
    }
    const { geo, context } = await phoneContext(true, { timeoutMs: GEO_WARM_MS });
    setGpsHint(geoHint(true, geo));
    if (!geo.ok) {
      return;
    }
    const frame = { kind: "pin" as const, context };
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(encodeFrame(frame));
    }
  }
  sendPinRef.current = sendPin;

  function toggleGps() {
    setGpsOn((on) => {
      const next = !on;
      saveGeoPref(next);
      gpsOnRef.current = next;
      geoWarm.current = false;
      setGpsHint(next ? "GPS attaches on send if the OS allows it." : "GPS off");
      if (next) {
        void warmGps();
      }
      return next;
    });
  }

  async function sendPhoto(file: File) {
    const got = await fileToPhoto(file);
    if (!got.ok) {
      setGpsHint(got.error);
      return;
    }
    await sendText("", got.url);
  }

  async function copyIdentity() {
    const bits = [me?.email, me?.sub].filter((v): v is string => Boolean(v));
    try {
      await navigator.clipboard.writeText(bits.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const title = useMemo(
    () => waitingForCrane || mailboxGap ? "Pendant" : displaySlug(roomSlug),
    [waitingForCrane, mailboxGap, roomSlug],
  );
  const hideSecrets = painting;
  const faceAuth = hideSecrets
    ? {}
    : {
        secret: cfg?.mode === "spike" ? secret || undefined : undefined,
        bearer: !phone && cfg?.mode === "oidc" ? bearer || undefined : undefined,
      };
  const canEditFace = Boolean(listed && roomSlug) && !needGoogle && !waitingForCrane && !mailboxGap;

  const faceProps = {
    slug: listed ? roomSlug : "",
    rev: avatarRev,
    editable: canEditFace,
    onRev: setAvatarRev,
    onError: setFaceHint,
    ...faceAuth,
  };

  let mouth: ReactNode;
  if (needGoogle) {
    mouth = (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <KitAvatar {...faceProps} size="lg" editable={false} />
        <p className="text-sm text-body">Sign in with Google to talk.</p>
        <a className="rounded-xl border border-accent-line bg-accent-soft px-4 py-2 text-sm text-mark" href="/api/auth/google">
          Continue with Google
        </a>
      </main>
    );
  } else if (mailboxGap && cfg?.gap) {
    mouth = (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <KitAvatar {...faceProps} size="lg" editable={false} />
        <ConfigGapNote gap={cfg.gap} />
      </main>
    );
  } else if (waitingForCrane) {
    mouth = (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <KitAvatar {...faceProps} size="lg" editable={false} />
        <p className="text-sm text-body">
          {cranes.length
            ? `Not on ${displaySlug(roomSlug) || "that crane"} yet`
            : "Not on any crane yet — give this to your yard admin"}
        </p>
        {me?.email
          ? <p className="text-sm text-fg">{me.email}</p>
          : null}
        <p className="break-all font-mono text-xs text-muted">{me?.sub}</p>
        {meWait
          ? <p className="text-xs text-dim">give it a minute</p>
          : null}
        <button
          type="button"
          className="rounded-xl border border-accent-line bg-accent-soft px-4 py-2 text-sm text-mark"
          onClick={() => void copyIdentity()}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <label className="mt-4 flex w-full max-w-xs flex-col gap-1 text-left text-xs text-muted">
          Agent name
          <input
            className="w-full rounded border border-edge bg-canvas px-1.5 py-1 text-sm text-fg"
            value={slugTouched ? slug : ""}
            placeholder="the crane slug"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
          />
        </label>
        <p className="max-w-xs text-xs text-dim">
          The picker fills in after the crane dials. If you know the slug, type it.
        </p>
      </main>
    );
  } else {
    mouth = (
      <>
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <Thread
            messages={messages}
            empty={(
              <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                <KitAvatar {...faceProps} size="lg" editable={false} />
                <p className="text-chat text-dim">
                  Nothing yet. Type below — or / for harness commands.
                </p>
              </div>
            )}
          />
        </div>
        <Compose
          key={`${sampleId ?? "live"}:${draft}:${sampleEmoji ? "emoji" : ""}`}
          disabled={status !== "up"}
          placeholder={phone ? `Message ${title} · / for commands` : "Reply as the crane"}
          gpsHint={phone ? gpsHint : undefined}
          gpsOn={gpsOn}
          onGpsToggle={phone ? toggleGps : undefined}
          commands={phone}
          catalog={catalog}
          initialText={draft}
          initialEmoji={sampleEmoji}
          onSend={(t) => void sendText(t)}
          onPhoto={phone ? (f) => void sendPhoto(f) : undefined}
          onPin={phone ? () => void sendPin() : undefined}
          onEngage={phone ? () => void warmGps() : undefined}
        />
      </>
    );
  }

  return (
    <div ref={shellRef} className="flex h-dvh flex-col overflow-hidden bg-canvas pb-[env(safe-area-inset-bottom)]" data-shot={phone ? "phone" : "crane"}>
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-panel px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <KitAvatar {...faceProps} size="md" />
          <div className="min-w-0">
            <p className="truncate text-chat font-medium text-fg">{title}</p>
            <p className="text-[11px] text-dim">
              <span className={status === "up" ? "text-ok" : "text-dim"}>
                {status === "up" ? "live" : status === "down" ? "down" : "idle"}
              </span>
              {status === "up" && typing ? " · typing…" : null}
              {cfg?.dev && !painting ? " · dev" : null}
              {phone ? null : " · stand-in"}
            </p>
          </div>
        </div>
        <InstallApp placement="header" />
        <SettingsMenu>
          <div className="flex flex-col gap-2">
            <InstallApp placement="block" />
            {phone ? <NotifyEnable onGranted={() => { void browserSubscribePush(roomSlug); }} /> : null}
            {phone && cfg?.mode === "oidc" && cranes.length
              ? (
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Agent
                    <select
                      className="w-full rounded border border-edge bg-canvas px-1.5 py-1 text-sm text-fg"
                      value={slug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setSlug(e.target.value);
                      }}
                    >
                      {slug && !cranes.includes(slug)
                        ? <option value={slug}>{displaySlug(slug)}</option>
                        : null}
                      {cranes.map((c) => (
                        <option key={c} value={c}>{displaySlug(c)}</option>
                      ))}
                    </select>
                  </label>
                )
              : null}
            {mailboxGap || (phone && cfg?.mode === "oidc" && waitingForCrane)
              ? null
              : (
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Agent name
                    <input
                      className="w-full rounded border border-edge bg-canvas px-1.5 py-1 text-sm text-fg"
                      value={slug}
                      placeholder="the crane slug"
                      spellCheck={false}
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="off"
                      onChange={(e) => {
                        setSlugTouched(true);
                        setSlug(e.target.value.toLowerCase());
                      }}
                    />
                  </label>
                )}
            {cfg?.mode === "spike" && !hideSecrets
              ? (
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Agent access secret
                    <input
                      type="password"
                      autoComplete="off"
                      className="w-full rounded border border-edge bg-canvas px-1.5 py-1 text-sm text-fg"
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                    />
                  </label>
                )
              : null}
            {!phone && cfg?.mode === "oidc" && !hideSecrets
              ? (
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Agent access token
                    <input
                      type="password"
                      autoComplete="off"
                      className="w-full rounded border border-edge bg-canvas px-1.5 py-1 text-sm text-fg"
                      value={bearer}
                      onChange={(e) => setBearer(e.target.value)}
                    />
                  </label>
                )
              : null}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">Theme</span>
              <ThemeSelect />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">Font size</span>
              <FontSelect />
            </div>
            {(cfg?.dev || (cfg?.google && phone))
              ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2">
                    {cfg?.dev
                      ? phone
                        ? <a className="text-xs text-dim underline" href="/crane">Open crane stand-in</a>
                        : <a className="text-xs text-dim underline" href="/">Open phone</a>
                      : null}
                    {cfg?.google && phone && !cfg.gap
                      ? (
                          me
                            ? (
                                <form action="/api/auth/logout" method="post">
                                  <button type="submit" className="text-xs text-dim underline">sign out</button>
                                </form>
                              )
                            : <a className="text-xs text-mark underline" href="/login">sign in</a>
                        )
                      : null}
                  </div>
                )
              : null}
          </div>
        </SettingsMenu>
      </header>
      {faceHint
        ? <p className="shrink-0 border-b border-line px-3 py-1 text-[11px] text-danger">{faceHint}</p>
        : null}
      {mouth}
    </div>
  );
}
