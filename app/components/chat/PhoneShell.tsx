"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThemeSelect } from "../shared/ThemeSelect";
import { Compose } from "./Compose";
import { Thread, type ChatBubble } from "./Thread";
import { mailboxUrl, parseIncoming } from "@/app/lib/socket";
import { browserGeo } from "@/app/lib/geo";
import { fileToPhoto } from "@/app/lib/photo";
import { applyTheme, themeFromQuery } from "@/app/lib/theme";
import { buildContext } from "@/lib/phone/context";
import { encodeFrame, type Role } from "@/lib/mailbox/frame";
import { nextMockReply, parseSample, sampleScene, type SampleId } from "@/lib/dev/samples";

type AuthCfg = { mode: "spike" | "oidc" | null; google: boolean; dev?: boolean };
type Me = { sub: string; email?: string } | null;

export function PhoneShell({ role = "phone" }: { role?: Role }) {
  const [slug, setSlug] = useState("kit");
  const [secret, setSecret] = useState("");
  const [bearer, setBearer] = useState("");
  const [cfg, setCfg] = useState<AuthCfg | null>(null);
  const [me, setMe] = useState<Me>(null);
  const [sampleId, setSampleId] = useState<SampleId | null>(null);
  const [status, setStatus] = useState<"idle" | "up" | "down">("idle");
  const [gpsHint, setGpsHint] = useState("GPS attaches on send if the OS allows it.");
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const echoTimer = useRef(0);
  const echoCount = useRef(0);
  const phone = role === "phone";
  const painting = Boolean(cfg?.dev && sampleId);
  const localEcho = Boolean(cfg?.dev && !sampleId && phone);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setSampleId(parseSample(q.get("sample")));
    const theme = themeFromQuery(q.get("theme"));
    if (theme) {
      applyTheme(theme);
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
    if (!cfg?.dev || !sampleId) {
      return;
    }
    const scene = sampleScene(sampleId, role);
    setMessages(scene.messages);
    setStatus(scene.status);
    if (scene.gpsHint) {
      setGpsHint(scene.gpsHint);
    }
  }, [cfg?.dev, sampleId, role]);

  useEffect(() => {
    scroller.current?.scrollTo?.({ top: scroller.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    return () => window.clearTimeout(echoTimer.current);
  }, []);

  const needGoogle = Boolean(
    phone && (
      (cfg?.dev && sampleId === "unsigned")
      || (cfg?.mode === "oidc" && !me && !cfg.dev)
    ),
  );
  const canSocket = Boolean(cfg && slug && (cfg.mode === "spike" ? secret : phone ? me : bearer));

  const connect = useCallback(() => {
    wsRef.current?.close();
    if (typeof window === "undefined" || !canSocket) {
      return;
    }
    const url = mailboxUrl({
      host: window.location.host,
      protocol: window.location.protocol,
      slug,
      role,
      secret: cfg?.mode === "spike" ? secret : undefined,
      bearer: !phone && cfg?.mode === "oidc" ? bearer : undefined,
    });
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => setStatus("up");
    ws.onclose = () => setStatus("down");
    ws.onerror = () => setStatus("down");
    ws.onmessage = (ev) => {
      const frame = parseIncoming(String(ev.data));
      if (!frame) {
        return;
      }
      const from = phone ? "kit" : "you";
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${prev.length}`,
          from,
          text: frame.text ?? "",
          kind: frame.kind,
          at: Date.now(),
          photo: frame.images?.[0]?.url,
        },
      ]);
    };
  }, [bearer, canSocket, cfg?.mode, phone, role, secret, slug]);

  useEffect(() => {
    if (!canSocket || painting) {
      return;
    }
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [canSocket, connect, painting]);

  useEffect(() => {
    if (painting || canSocket || !localEcho) {
      return;
    }
    setStatus("up");
  }, [painting, canSocket, localEcho]);

  async function sendText(text: string, photo?: string) {
    const geo = phone ? await browserGeo() : { ok: false as const, reason: "unavailable" as const };
    if (phone) {
      setGpsHint(geo.ok ? `pin ±${Math.round(geo.geo.accuracy_m ?? 0)}m this send` : "GPS omitted (denied or unavailable)");
    }
    const frame = {
      text,
      kind: phone ? "inbound" as const : "reply" as const,
      images: photo ? [{ url: photo }] : undefined,
      context: phone
        ? buildContext({
            geo: geo.ok ? geo.geo : null,
            net: undefined,
          })
        : undefined,
    };
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(encodeFrame(frame));
    }
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-out`,
        from: phone ? "you" : "kit",
        text,
        at: Date.now(),
        photo,
      },
    ]);
    if (localEcho && !canSocket && !painting) {
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
      }, 400);
    }
  }

  async function sendPhoto(file: File) {
    const got = await fileToPhoto(file);
    if (!got.ok) {
      setGpsHint(got.error);
      return;
    }
    await sendText("", got.url);
  }

  const title = useMemo(() => phone ? "Pendant" : "Crane stand-in", [phone]);
  const hideSecrets = painting;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas" data-shot={phone ? "phone" : "crane"}>
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2">
        <p className="text-sm font-medium text-fg">{title}</p>
        <span className={`text-[11px] ${status === "up" ? "text-ok" : "text-dim"}`}>
          {status === "up" ? "live" : status === "down" ? "down" : "idle"}
        </span>
        {cfg?.dev && !painting
          ? <span className="text-[11px] text-dim">dev</span>
          : null}
        <label className="ml-auto flex items-center gap-1 text-xs text-muted">
          slug
          <input
            className="w-24 rounded border border-edge bg-canvas px-1 py-0.5 text-fg"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </label>
        {cfg?.mode === "spike" && !hideSecrets
          ? (
              <label className="flex items-center gap-1 text-xs text-muted">
                secret
                <input
                  type="password"
                  autoComplete="off"
                  className="w-28 rounded border border-edge bg-canvas px-1 py-0.5 text-fg"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </label>
            )
          : null}
        {!phone && cfg?.mode === "oidc" && !hideSecrets
          ? (
              <label className="flex items-center gap-1 text-xs text-muted">
                bearer
                <input
                  type="password"
                  autoComplete="off"
                  className="w-28 rounded border border-edge bg-canvas px-1 py-0.5 text-fg"
                  value={bearer}
                  onChange={(e) => setBearer(e.target.value)}
                />
              </label>
            )
          : null}
        {phone
          ? <a className="text-xs text-dim underline" href="/crane">crane tab</a>
          : <a className="text-xs text-dim underline" href="/">phone</a>}
        {cfg?.google && phone
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
        <ThemeSelect />
      </header>
      {needGoogle
        ? (
            <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-body">Sign in with Google to talk.</p>
              <a className="rounded-xl border border-accent-line bg-accent-soft px-4 py-2 text-sm text-mark" href="/api/auth/google">
                Continue with Google
              </a>
            </main>
          )
        : (
            <>
              <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
                <Thread messages={messages} />
              </div>
              <Compose
                disabled={status !== "up"}
                placeholder={phone ? "Message Kit" : "Reply as the crane"}
                gpsHint={phone ? gpsHint : undefined}
                onSend={(t) => void sendText(t)}
                onPhoto={phone ? (f) => void sendPhoto(f) : undefined}
              />
            </>
          )}
    </div>
  );
}
