"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThemeSelect } from "../shared/ThemeSelect";
import type { SlashCommand } from "@/app/lib/slash";
import { Compose } from "./Compose";
import { KitAvatar } from "./KitAvatar";
import { SettingsMenu } from "./SettingsMenu";
import { Thread, type ChatBubble } from "./Thread";
import { mailboxUrl, parseIncoming } from "@/app/lib/socket";
import { browserBattery } from "@/app/lib/battery";
import { browserBumpBadge, browserClearBadge } from "@/app/lib/badge";
import { browserGeo } from "@/app/lib/geo";
import { browserBuzzPush } from "@/app/lib/haptic";
import { browserNet } from "@/app/lib/net";
import { fileToPhoto } from "@/app/lib/photo";
import { browserGeoPref, saveGeoPref } from "@/app/lib/prefs";
import { applyTheme, themeFromQuery } from "@/app/lib/theme";
import { browserWakeLock, releaseScreenWake, type WakeLockSentinel } from "@/app/lib/wake";
import { displaySlug, faceRevFromUnknown } from "@/lib/avatar/store";
import { buildContext } from "@/lib/phone/context";
import { geoHint } from "@/lib/phone/geo";
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
  const [gpsOn, setGpsOn] = useState(true);
  const [prefsReady, setPrefsReady] = useState(false);
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [draft, setDraft] = useState("");
  const [catalog, setCatalog] = useState<SlashCommand[]>([]);
  const [avatarRev, setAvatarRev] = useState(0);
  const [faceHint, setFaceHint] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const echoTimer = useRef(0);
  const echoCount = useRef(0);
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const badgeRef = useRef(0);
  const pinConsumed = useRef(false);
  const sendPinRef = useRef<() => Promise<void>>(async () => {});
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
    setDraft(scene.draft ?? "");
    setCatalog(scene.catalog ?? []);
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
    setGpsOn(on);
    if (!on) {
      setGpsHint("GPS off");
    }
    setPrefsReady(true);
  }, [phone]);

  useEffect(() => {
    return () => {
      window.clearTimeout(echoTimer.current);
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
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phone]);

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
    ws.onclose = () => {
      setStatus("down");
      void releaseScreenWake(wakeRef.current);
      wakeRef.current = null;
    };
    ws.onerror = () => setStatus("down");
    ws.onmessage = (ev) => {
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
      if (phone) {
        void releaseScreenWake(wakeRef.current);
        wakeRef.current = null;
        browserBuzzPush(frame.kind);
        badgeRef.current = browserBumpBadge(badgeRef.current, frame.kind);
      }
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

  async function phoneContext(wantGeo: boolean) {
    const [geo, battery] = await Promise.all([
      wantGeo ? browserGeo() : Promise.resolve({ ok: false as const, reason: "unavailable" as const }),
      browserBattery(),
    ]);
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
    const { geo, context } = phone
      ? await phoneContext(wantGeo)
      : { geo: { ok: false as const, reason: "unavailable" as const }, context: undefined };
    if (phone) {
      setGpsHint(geoHint(wantGeo, geo));
      badgeRef.current = browserClearBadge();
      void takeWake();
    }
    const trimmed = text.trim();
    const frame = {
      text: trimmed || undefined,
      kind: phone ? "inbound" as const : "reply" as const,
      images: photo ? [{ url: photo }] : undefined,
      context,
    };
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(encodeFrame(frame));
    }
    if (trimmed || photo) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-out`,
          from: phone ? "you" : "kit",
          text: trimmed,
          at: Date.now(),
          photo,
        },
      ]);
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
    const { geo, context } = await phoneContext(true);
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
      setGpsHint(next ? "GPS attaches on send if the OS allows it." : "GPS off");
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

  const title = useMemo(() => displaySlug(slug), [slug]);
  const hideSecrets = painting;
  const faceAuth = hideSecrets
    ? {}
    : {
        secret: cfg?.mode === "spike" ? secret || undefined : undefined,
        bearer: !phone && cfg?.mode === "oidc" ? bearer || undefined : undefined,
      };
  const canEditFace = Boolean(slug) && !needGoogle;

  const faceProps = {
    slug: slug || "kit",
    rev: avatarRev,
    editable: canEditFace,
    onRev: setAvatarRev,
    onError: setFaceHint,
    ...faceAuth,
  };

  return (
    <div className="flex min-h-dvh flex-col bg-canvas" data-shot={phone ? "phone" : "crane"}>
      <header className="flex items-center gap-2 border-b border-line bg-panel px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <KitAvatar {...faceProps} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{title}</p>
            <p className="text-[11px] text-dim">
              <span className={status === "up" ? "text-ok" : "text-dim"}>
                {status === "up" ? "live" : status === "down" ? "down" : "idle"}
              </span>
              {cfg?.dev && !painting ? " · dev" : null}
              {phone ? null : " · stand-in"}
            </p>
          </div>
        </div>
        <SettingsMenu>
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Agent name
              <input
                className="w-full rounded border border-edge bg-canvas px-1.5 py-1 text-sm text-fg"
                value={slug}
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
              />
            </label>
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
            {(cfg?.dev || (cfg?.google && phone))
              ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2">
                    {cfg?.dev
                      ? phone
                        ? <a className="text-xs text-dim underline" href="/crane">Open crane stand-in</a>
                        : <a className="text-xs text-dim underline" href="/">Open phone</a>
                      : null}
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
                  </div>
                )
              : null}
          </div>
        </SettingsMenu>
      </header>
      {faceHint
        ? <p className="border-b border-line px-3 py-1 text-[11px] text-danger">{faceHint}</p>
        : null}
      {needGoogle
        ? (
            <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <KitAvatar {...faceProps} size="lg" editable={false} />
              <p className="text-sm text-body">Sign in with Google to talk.</p>
              <a className="rounded-xl border border-accent-line bg-accent-soft px-4 py-2 text-sm text-mark" href="/api/auth/google">
                Continue with Google
              </a>
            </main>
          )
        : (
            <>
              <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
                <Thread
                  messages={messages}
                  empty={(
                    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                      <KitAvatar {...faceProps} size="lg" editable={false} />
                      <p className="text-sm text-dim">
                        Nothing yet. Type below — or / for harness commands.
                      </p>
                    </div>
                  )}
                />
              </div>
              <Compose
                key={`${sampleId ?? "live"}:${draft}`}
                disabled={status !== "up"}
                placeholder={phone ? `Message ${title} · / for commands` : "Reply as the crane"}
                gpsHint={phone ? gpsHint : undefined}
                gpsOn={gpsOn}
                onGpsToggle={phone ? toggleGps : undefined}
                commands={phone}
                catalog={catalog}
                initialText={draft}
                onSend={(t) => void sendText(t)}
                onPhoto={phone ? (f) => void sendPhoto(f) : undefined}
                onPin={phone ? () => void sendPin() : undefined}
              />
            </>
          )}
    </div>
  );
}
