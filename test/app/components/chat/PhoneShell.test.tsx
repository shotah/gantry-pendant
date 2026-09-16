/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhoneShell } from "@/app/components/chat/PhoneShell";
import { RELEASE } from "@/app/lib/release";
import { DEV_USER, MOCK_REPLIES, SAMPLE_LINES } from "@/lib/dev/samples";
import { TYPING_TTL_MS } from "@/lib/mailbox/typing";
import { clearGeoCache } from "@/lib/phone/geo";
import type { SpeakEvent } from "@/lib/phone/speaker";
import { browserSpeak } from "@/app/lib/tts";

vi.mock("@/app/lib/tts", () => ({
  browserSpeak: vi.fn(async () => true),
  hushSpeaker: vi.fn(),
}));

class FakeRecognizer {
  static last: FakeRecognizer | null = null;
  lang = "";
  continuous = true;
  interimResults = true;
  maxAlternatives = 3;
  onresult: ((ev: { results: ArrayLike<{ isFinal: boolean } & ArrayLike<{ transcript: string }>> }) => void) | null = null;
  onerror: ((ev: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    FakeRecognizer.last = this;
  }
}

/** Tap the header mic from typing (default) into hold-to-talk. */
function voiceOn() {
  fireEvent.click(screen.getByRole("button", { name: "Voice off" }));
  expect(screen.getByRole("button", { name: "Voice on" }).getAttribute("aria-pressed")).toBe("true");
}

/** Press, say the words, release, let the recognizer end — one spoken turn. */
function holdAndSay(text: string) {
  const hold = screen.getByRole("button", { name: "Hold to talk" });
  fireEvent.pointerDown(hold, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
  const rec = FakeRecognizer.last!;
  rec.onresult?.({ results: [{ isFinal: true, length: 1, 0: { transcript: text } }] });
  fireEvent.pointerUp(hold, { pointerId: 1, clientX: 0, clientY: 0 });
  act(() => rec.onend?.());
}

function stubAuth(dev: boolean, extra: { voice?: boolean } = {}) {
  vi.stubGlobal("fetch", async (input: RequestInfo) => {
    const url = String(input);
    if (url.includes("/api/auth/config")) {
      return Response.json({ mode: "spike", google: false, dev, voice: extra.voice === true });
    }
    if (url.includes("/api/auth/me")) {
      return dev ? Response.json(DEV_USER) : new Response(null, { status: 401 });
    }
    return new Response(null, { status: 404 });
  });
}

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeSocket[] = [];

  readonly url: string;
  readyState = FakeSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent<string>) => void) | null = null;
  send = vi.fn<(data: string) => void>();

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }

  close() {
    if (this.readyState === FakeSocket.CLOSED) {
      return;
    }
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.(new Event("close"));
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  deliver(data: string) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}

function stubSocket() {
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket as unknown as typeof WebSocket);
}

function liveSocket() {
  const ws = FakeSocket.instances.at(-1);
  expect(ws).toBeTruthy();
  return ws as FakeSocket;
}

async function connectSpike(opts: { voice?: boolean } = {}) {
  stubAuth(true, opts);
  stubSocket();
  render(<PhoneShell />);
  expect(await screen.findByText("live")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "settings" }));
  fireEvent.change(screen.getByLabelText("Agent access secret"), { target: { value: "s" } });
  fireEvent.click(screen.getByRole("button", { name: "settings" }));
  expect(FakeSocket.instances.length).toBeGreaterThanOrEqual(1);
  return liveSocket();
}

function stubGeo(lat = 47.6, lon = -122.3, accuracy = 8) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition(success: (p: GeolocationPosition) => void) {
        success({
          coords: {
            latitude: lat,
            longitude: lon,
            accuracy,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON() {
              return {};
            },
          },
          timestamp: 1,
          toJSON() {
            return {};
          },
        });
      },
    },
  });
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  window.localStorage.removeItem("pendant.geo");
  window.localStorage.removeItem("pendant.voice");
  window.localStorage.removeItem("pendant.lang");
  window.localStorage.removeItem("pendant.font");
  window.localStorage.removeItem("pendant.photo");
  window.localStorage.removeItem("pendant.backdrop");
  window.localStorage.removeItem("pendant.followTheme");
  window.localStorage.removeItem("pendant.roomTheme");
  window.localStorage.removeItem("pendant.theme");
  document.documentElement.removeAttribute("data-font");
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
  window.localStorage.removeItem("pendant.geo");
  window.localStorage.removeItem("pendant.voice");
  window.localStorage.removeItem("pendant.lang");
  window.localStorage.removeItem("pendant.font");
  window.localStorage.removeItem("pendant.photo");
  window.localStorage.removeItem("pendant.backdrop");
  window.localStorage.removeItem("pendant.followTheme");
  window.localStorage.removeItem("pendant.roomTheme");
  window.localStorage.removeItem("pendant.theme");
  document.documentElement.removeAttribute("data-font");
  document.documentElement.removeAttribute("data-theme");
  Reflect.deleteProperty(navigator, "permissions");
  Reflect.deleteProperty(navigator, "geolocation");
  Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(navigator, "userAgent");
  Reflect.deleteProperty(navigator, "standalone");
  Reflect.deleteProperty(document, "hidden");
  Reflect.deleteProperty(document, "visibilityState");
  FakeSocket.instances = [];
  clearGeoCache();
});

describe("PhoneShell", () => {
  it("paints a sample thread only when loopback dev is on", async () => {
    window.history.replaceState({}, "", "/?sample=thread");
    stubAuth(true);
    render(<PhoneShell />);
    expect(await screen.findByText(SAMPLE_LINES.threadKit)).toBeTruthy();
    expect(screen.getByText(SAMPLE_LINES.threadYou)).toBeTruthy();
    expect(screen.getByText("Kit")).toBeTruthy();
    expect(screen.queryByText("dev")).toBeNull();
  });

  it("locks the shell to the viewport so the thread scrolls inside", async () => {
    window.history.replaceState({}, "", "/?sample=thread");
    stubAuth(true);
    const { container } = render(<PhoneShell />);
    expect(await screen.findByText(SAMPLE_LINES.threadKit)).toBeTruthy();
    const shell = container.querySelector("[data-shot=phone]");
    expect(shell).toBeTruthy();
    const shellClass = shell?.className.split(/\s+/) ?? [];
    expect(shellClass).toEqual(expect.arrayContaining([
      "h-dvh",
      "overflow-hidden",
      "pt-[env(safe-area-inset-top)]",
      "pb-[env(safe-area-inset-bottom)]",
    ]));
    expect(shellClass).not.toContain("min-h-dvh");
    const thread = shell?.querySelector(".overflow-y-auto");
    expect(thread?.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["min-h-0", "flex-1", "overflow-y-auto", "[overflow-anchor:none]"]),
    );
  });

  it("lets the header face hang over the thread without growing the header", async () => {
    window.history.replaceState({}, "", "/?sample=thread");
    stubAuth(true);
    const { container } = render(<PhoneShell />);
    expect(await screen.findByText(SAMPLE_LINES.threadKit)).toBeTruthy();
    const header = container.querySelector("header");
    expect(header?.className.split(/\s+/)).toEqual(expect.arrayContaining(["relative", "z-20"]));
    const slot = header?.querySelector(":scope > div > div");
    expect(slot?.className.split(/\s+/)).toEqual(expect.arrayContaining(["relative", "h-10", "w-20"]));
    const wrap = slot?.querySelector(":scope > div");
    expect(wrap?.className.split(/\s+/)).toEqual(expect.arrayContaining(["absolute", "-left-0.5", "-top-1"]));
    const face = header?.querySelector("img");
    expect(face?.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["h-[82px]", "w-[82px]", "border-2", "border-line"]),
    );
    expect(header?.querySelector(".ring-panel")).toBeNull();
  });

  it("ignores sample query when not in dev", async () => {
    window.history.replaceState({}, "", "/?sample=thread");
    stubAuth(false);
    render(<PhoneShell />);
    expect(await screen.findByText(/Nothing yet/)).toBeTruthy();
    expect(screen.queryByText(SAMPLE_LINES.threadKit)).toBeNull();
  });

  it("shows the Google gate for the unsigned sample", async () => {
    window.history.replaceState({}, "", "/?sample=unsigned");
    stubAuth(true);
    render(<PhoneShell />);
    expect(await screen.findByText("Sign in with Google to talk.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue with Google" }).getAttribute("href")).toBe("/api/auth/google");
    expect(screen.queryByRole("button", { name: "Change Kit's photo" })).toBeNull();
    expect(screen.queryByText(/Add to Home Screen/)).toBeNull();
    expect(screen.queryByText(/Google didn't finish/)).toBeNull();
  });

  it("tells iPhone Safari to sign in before Add to Home Screen", async () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    });
    stubOidc(null);
    render(<PhoneShell />);
    expect(await screen.findByRole("link", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.getByText(/Sign in here first, then Share → Add to Home Screen/)).toBeTruthy();
  });

  it("explains a bounced Google round-trip from ?auth=retry", async () => {
    window.history.replaceState({}, "", "/?auth=retry");
    stubOidc(null);
    render(<PhoneShell />);
    expect(await screen.findByRole("link", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.getByText("Google didn't finish. Try again.")).toBeTruthy();
  });

  it("tells an unlisted Google account why it was turned away from ?auth=denied", async () => {
    window.history.replaceState({}, "", "/?auth=denied");
    stubOidc(null);
    render(<PhoneShell />);
    expect(await screen.findByRole("link", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.getByText(/isn't on any crane's list/)).toBeTruthy();
    expect(screen.queryByText(/Google didn't finish/)).toBeNull();
  });

  it("carries a typed slug through the Google start link", async () => {
    window.history.replaceState({}, "", "/?slug=kit");
    stubOidc(null);
    render(<PhoneShell />);
    const link = await screen.findByRole("link", { name: "Continue with Google" });
    expect(link.getAttribute("href")).toBe("/api/auth/google?next=%2F%3Fslug%3Dkit");
  });

  it("points a bounced iPhone Home Screen app back through Safari", async () => {
    window.history.replaceState({}, "", "/?auth=retry");
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    });
    Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
    stubOidc(null);
    render(<PhoneShell />);
    expect(await screen.findByRole("link", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.getByText(/open pendant in Safari, sign in there, then Add to Home Screen again/)).toBeTruthy();
  });

  it("says a crane is missing instead of offering Google", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/auth/config")) {
        return Response.json({ mode: null, google: true, dev: false, gap: "crane" });
      }
      if (url.includes("/api/auth/me")) {
        return new Response(null, { status: 401 });
      }
      return new Response(null, { status: 404 });
    });
    render(<PhoneShell />);
    expect(await screen.findByText("No crane on this mailbox yet")).toBeTruthy();
    expect(screen.getByText(/Gantree Build/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Continue with Google" })).toBeNull();
    expect(screen.queryByText(/Nothing yet/)).toBeNull();
  });

  it("echoes a canned Kit reply in dev without a socket", async () => {
    stubAuth(true);
    render(<PhoneShell />);
    expect(await screen.findByText("live")).toBeTruthy();
    const box = screen.getByPlaceholderText(/Message Kit/);
    fireEvent.change(box, { target: { value: "hello kit" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("hello kit")).toBeTruthy();
    expect(screen.queryByText("sending")).toBeNull();
    expect(await screen.findByText(MOCK_REPLIES[0], {}, { timeout: 1000 })).toBeTruthy();
    expect(screen.getByText(/dev/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change Kit's photo" })).toBeTruthy();
  });

  it("keeps agent name, theme, and the crane stand-in behind the settings cog", async () => {
    stubAuth(true);
    render(<PhoneShell />);
    expect(await screen.findByText("live")).toBeTruthy();
    expect(screen.getByText("Kit")).toBeTruthy();
    expect(screen.queryByLabelText("Agent name")).toBeNull();
    expect(screen.queryByRole("button", { name: "color theme" })).toBeNull();
    expect(screen.queryByLabelText("Font size")).toBeNull();
    expect(screen.queryByRole("link", { name: "Open crane stand-in" })).toBeNull();
    expect(screen.queryByText(RELEASE)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(screen.getByText(RELEASE)).toBeTruthy();
    expect(screen.getByText(/Cast, save and share/)).toBeTruthy();
    expect(screen.getByLabelText("Agent name")).toBeTruthy();
    expect((screen.getByLabelText("Agent name") as HTMLInputElement).value).toBe("kit");
    expect(screen.getByLabelText("Agent access secret")).toBeTruthy();
    expect(screen.getByRole("button", { name: "color theme" })).toBeTruthy();
    expect((screen.getByLabelText("Font size") as HTMLSelectElement).value).toBe("sm");
    expect(screen.getByRole("button", { name: "Enable notifications" })).toBeTruthy();
    expect(screen.getByText("Access")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enable location" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enable microphone" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open crane stand-in" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Agent name"), { target: { value: "Ada" } });
    expect((screen.getByLabelText("Agent name") as HTMLInputElement).value).toBe("ada");
    expect(screen.getByText("Ada")).toBeTruthy();
  });

  it("applies a chat font size from the query string", async () => {
    window.history.replaceState({}, "", "/?sample=thread&font=xl");
    stubAuth(true);
    render(<PhoneShell />);
    expect(await screen.findByText(SAMPLE_LINES.threadKit)).toBeTruthy();
    expect(document.documentElement.getAttribute("data-font")).toBe("xl");
  });

  it("applies a chat font size from settings", async () => {
    stubAuth(true);
    render(<PhoneShell />);
    expect(await screen.findByText("live")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    const picker = screen.getByLabelText("Font size") as HTMLSelectElement;
    expect([...picker.options].map((o) => o.textContent)).toEqual(["Small", "Medium", "Large", "Extra large"]);
    fireEvent.change(picker, { target: { value: "lg" } });
    expect(document.documentElement.getAttribute("data-font")).toBe("lg");
    expect(localStorage.getItem("pendant.font")).toBe("lg");
    expect(picker.value).toBe("lg");
  });

  it("paints typing and a draft bubble for the stream sample", async () => {
    window.history.replaceState({}, "", "/?sample=stream");
    stubAuth(true);
    render(<PhoneShell />);
    expect(await screen.findByText(/typing/)).toBeTruthy();
    expect(screen.getByText(SAMPLE_LINES.streamDraft)).toBeTruthy();
    expect(screen.getByText(SAMPLE_LINES.threadYou)).toBeTruthy();
    expect(screen.getByText(SAMPLE_LINES.streamDraft).closest(".italic")).toBeTruthy();
  });

  it("opens the emoji picker for the emoji sample", async () => {
    window.history.replaceState({}, "", "/?sample=emoji");
    stubAuth(true);
    render(<PhoneShell />);
    expect(await screen.findByRole("dialog", { name: "Emoji" })).toBeTruthy();
    expect(screen.getByLabelText("Search emoji")).toBeTruthy();
    expect(screen.getByText(SAMPLE_LINES.threadKit)).toBeTruthy();
  });

  it("paints the harness command picker for the cmds sample", async () => {
    window.history.replaceState({}, "", "/?sample=cmds");
    stubAuth(true);
    render(<PhoneShell />);
    expect(await screen.findByText("These go to the crane, not the chat model.")).toBeTruthy();
    expect(screen.getByRole("option", { name: /^\/new / })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "attach" }));
    expect(screen.getByRole("button", { name: "harness commands" })).toBeTruthy();
  });

  it("skips geolocation when GPS is toggled off", async () => {
    const geo = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: geo },
    });
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    fireEvent.click(screen.getByRole("button", { name: "attach" }));
    fireEvent.click(screen.getByRole("button", { name: "GPS on" }));
    expect(screen.getByRole("button", { name: "GPS off" })).toBeTruthy();
    expect(screen.getByText("GPS off")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Message Kit/), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("hi")).toBeTruthy();
    expect(geo).not.toHaveBeenCalled();
    await waitFor(() => expect(ws.send).toHaveBeenCalled());
    const frame = JSON.parse(String(ws.send.mock.calls[0]?.[0])) as { text?: string; context?: unknown };
    expect(frame.text).toBe("hi");
    expect(frame.context).toEqual({ surface: "browser" });
  });

  it("attaches GPS on the inbound frame", async () => {
    stubGeo();
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    const box = screen.getByPlaceholderText(/Message Kit/);
    fireEvent.focus(box);
    expect(await screen.findByTitle("pin ±8m this send")).toBeTruthy();
    fireEvent.change(box, { target: { value: "near me" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("near me")).toBeTruthy();
    await waitFor(() => expect(ws.send).toHaveBeenCalled());
    const frame = JSON.parse(String(ws.send.mock.calls[0]?.[0])) as {
      text?: string;
      kind?: string;
      context?: { geo?: { lat: number; lon: number; accuracy_m?: number }; at?: string; tz?: string; surface?: string; battery?: unknown; net?: string };
    };
    expect(frame.kind).toBe("inbound");
    expect(frame.text).toBe("near me");
    expect(frame.text).not.toContain("[location]");
    expect(frame.context).toEqual({ geo: { lat: 47.6, lon: -122.3, accuracy_m: 8 }, surface: "browser" });
    expect(screen.getByRole("button", { name: "attach" }).getAttribute("title")).toBe("pin ±8m this send");
  });

  it("strips a pasted clock footer from inbound text", async () => {
    stubGeo();
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    const box = screen.getByPlaceholderText(/Message Kit/);
    fireEvent.focus(box);
    expect(await screen.findByTitle("pin ±8m this send")).toBeTruthy();
    fireEvent.change(box, {
      target: { value: "tacos\n\n[current time] NOW: fake" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("tacos")).toBeTruthy();
    expect(screen.queryByText(/NOW: fake/)).toBeNull();
    await waitFor(() => expect(ws.send).toHaveBeenCalled());
    const frame = JSON.parse(String(ws.send.mock.calls[0]?.[0])) as {
      text?: string;
      context?: { geo?: { lat: number } };
    };
    expect(frame.text).toBe("tacos");
    expect(frame.context?.geo).toEqual({ lat: 47.6, lon: -122.3, accuracy_m: 8 });
  });

  it("sends a silent pin when GPS returns a fix", async () => {
    stubGeo(1, 2, 5);
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    fireEvent.click(screen.getByRole("button", { name: "attach" }));
    fireEvent.click(screen.getByRole("button", { name: "drop pin" }));
    expect(await screen.findByText("pin ±5m this send")).toBeTruthy();
    expect(ws.send).toHaveBeenCalled();
    const frame = JSON.parse(String(ws.send.mock.calls[0]?.[0])) as {
      kind?: string;
      text?: string;
      context?: { geo?: { lat: number; lon: number } };
    };
    expect(frame.kind).toBe("pin");
    expect(frame.text).toBeUndefined();
    expect(frame.context).toEqual({ geo: { lat: 1, lon: 2, accuracy_m: 5 }, surface: "browser" });
    expect(screen.getByText(/Nothing yet/)).toBeTruthy();
  });

  it("does not append a bubble for a silent pin without a fix", async () => {
    stubAuth(true);
    render(<PhoneShell />);
    expect(await screen.findByText("live")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "attach" }));
    fireEvent.click(screen.getByRole("button", { name: "drop pin" }));
    expect(await screen.findByText("GPS omitted (denied or unavailable)")).toBeTruthy();
    expect(screen.getByText(/Nothing yet/)).toBeTruthy();
  });

  it("schedules a reconnect after the socket closes", async () => {
    const first = await connectSpike();
    vi.useFakeTimers();
    act(() => {
      first.close();
    });
    expect(FakeSocket.instances).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(FakeSocket.instances).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("reconnects on visibilitychange when the socket is not open", async () => {
    const first = await connectSpike();
    vi.useFakeTimers();
    act(() => {
      first.close();
    });
    expect(FakeSocket.instances).toHaveLength(1);
    act(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(FakeSocket.instances).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("redials an open phone socket when the thread becomes visible", async () => {
    const first = await connectSpike();
    act(() => {
      first.open();
    });
    expect(FakeSocket.instances).toHaveLength(1);
    act(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(FakeSocket.instances).toHaveLength(2);
    expect(first.readyState).toBe(FakeSocket.CLOSED);
  });

  it("closes the phone socket on freeze", async () => {
    const first = await connectSpike();
    act(() => {
      first.open();
    });
    act(() => {
      document.dispatchEvent(new Event("freeze"));
    });
    expect(first.readyState).toBe(FakeSocket.CLOSED);
  });

  it("paints catch-up by seq even when frames arrive out of order", async () => {
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    act(() => {
      ws.deliver(JSON.stringify({
        id: "b",
        kind: "reply",
        text: "second",
        seq: 2,
        at: 20,
      }));
      ws.deliver(JSON.stringify({
        id: "a",
        kind: "reply",
        text: "first",
        seq: 1,
        at: 10,
      }));
    });
    const items = screen.getAllByRole("listitem");
    expect(items.map((el) => el.textContent)).toEqual(["first", "second"]);
  });

  it("Worker has not published voice: no header mic even when Web Speech exists", async () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognizer);
    window.localStorage.setItem("pendant.voice", "on");
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    expect(screen.queryByRole("button", { name: /^Voice (on|off)$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hold to talk" })).toBeNull();
    expect(screen.getByPlaceholderText(/Message Kit/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
  });

  it("header mic: typing by default, tap swaps the row for hold-to-talk, remembers, tap again types", async () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognizer);
    const ws = await connectSpike({ voice: true });
    act(() => {
      ws.open();
    });
    const header = screen.getByRole("banner");
    const mic = screen.getByRole("button", { name: "Voice off" });
    const cog = screen.getByRole("button", { name: "settings" });
    expect(header.contains(mic)).toBe(true);
    expect(mic.compareDocumentPosition(cog) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mic.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByPlaceholderText(/Message Kit/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Hold to talk" })).toBeNull();

    voiceOn();
    expect(window.localStorage.getItem("pendant.voice")).toBe("on");
    expect(screen.getByRole("button", { name: "Hold to talk" })).toBeTruthy();
    expect(screen.queryByPlaceholderText(/Message Kit/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    expect(screen.queryByRole("button", { name: "emoji" })).toBeNull();
    expect(screen.queryByRole("button", { name: "attach" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Voice on" }));
    expect(window.localStorage.getItem("pendant.voice")).toBe("off");
    expect(screen.getByRole("button", { name: "Voice off" })).toBeTruthy();
    expect(screen.getByPlaceholderText(/Message Kit/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Hold to talk" })).toBeNull();
  });

  it("settings Access asks for the microphone when voice is published", async () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognizer);
    await connectSpike({ voice: true });
    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    expect(await screen.findByRole("button", { name: "Enable microphone" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enable location" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enable notifications" })).toBeTruthy();
  });

  it("a remembered voice pref opens straight into hold-to-talk", async () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognizer);
    window.localStorage.setItem("pendant.voice", "on");
    const ws = await connectSpike({ voice: true });
    act(() => {
      ws.open();
    });
    expect(screen.getByRole("button", { name: "Voice on" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Hold to talk" })).toBeTruthy();
    expect(screen.queryByPlaceholderText(/Message Kit/)).toBeNull();
  });

  it("Settings → Language: English by default; picking Japanese is remembered, heard, and spoken", async () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognizer);
    vi.mocked(browserSpeak).mockClear();
    const ws = await connectSpike({ voice: true });
    act(() => {
      ws.open();
    });
    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    const picker = screen.getByLabelText("Language") as HTMLSelectElement;
    expect(picker.value).toBe("en");
    expect([...picker.options].map((o) => o.textContent)).toEqual(["English", "日本語 · Japanese", "中文 · Mandarin"]);
    fireEvent.change(picker, { target: { value: "ja" } });
    expect(picker.value).toBe("ja");
    expect(window.localStorage.getItem("pendant.lang")).toBe("ja");
    fireEvent.click(screen.getByRole("button", { name: "settings" }));

    voiceOn();
    holdAndSay("今夜の天気は");
    expect(FakeRecognizer.last?.lang).toBe("ja-JP");
    await waitFor(() => expect(ws.send).toHaveBeenCalled());
    act(() => {
      ws.deliver(JSON.stringify({ id: "r1", kind: "reply", text: "雨です。", seq: 1, at: 10 }));
    });
    expect(browserSpeak).toHaveBeenCalledExactlyOnceWith("雨です。", { lang: "ja", onPhase: expect.any(Function) });
  });

  it("reads Settings → Language back from storage on load and shrugs off junk", async () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognizer);
    window.localStorage.setItem("pendant.lang", "zh");
    const ws = await connectSpike({ voice: true });
    act(() => {
      ws.open();
    });
    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    expect((screen.getByLabelText("Language") as HTMLSelectElement).value).toBe("zh");
    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    voiceOn();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Hold to talk" }), { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    expect(FakeRecognizer.last?.lang).toBe("zh-CN");
    cleanup();

    window.localStorage.setItem("pendant.lang", "klingon");
    stubAuth(true, { voice: true });
    render(<PhoneShell />);
    expect(await screen.findByText("live")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    expect((screen.getByLabelText("Language") as HTMLSelectElement).value).toBe("en");
  });

  it("hides Settings → Language when the Worker has not published voice", async () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognizer);
    await connectSpike();
    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    expect(screen.getByLabelText("Photo size")).toBeTruthy();
    expect(screen.queryByLabelText("Language")).toBeNull();
  });

  it("no Web Speech: no header mic, and a stale voice pref still types", async () => {
    window.localStorage.setItem("pendant.voice", "on");
    const ws = await connectSpike({ voice: true });
    act(() => {
      ws.open();
    });
    expect(screen.queryByRole("button", { name: /^Voice (on|off)$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hold to talk" })).toBeNull();
    expect(screen.getByPlaceholderText(/Message Kit/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
  });

  it("hold-to-talk auto-sends a spoken inbound and reads only the next live reply aloud", async () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognizer);
    vi.mocked(browserSpeak).mockClear();
    const ws = await connectSpike({ voice: true });
    act(() => {
      ws.open();
    });
    voiceOn();
    holdAndSay("what's the weather tonight");
    expect(await screen.findByText("what's the weather tonight")).toBeTruthy();
    await waitFor(() => expect(ws.send).toHaveBeenCalled());
    const frame = JSON.parse(String(ws.send.mock.calls[0]?.[0])) as {
      kind?: string;
      text?: string;
      context?: { input?: string; geo?: unknown };
    };
    expect(frame.kind).toBe("inbound");
    expect(frame.text).toBe("what's the weather tonight");
    expect(frame.context).toEqual({ surface: "browser", input: "spoken" });
    expect(screen.queryByPlaceholderText(/Message Kit/)).toBeNull();

    act(() => {
      ws.deliver(JSON.stringify({ kind: "typing", user_id: "1182" }));
      ws.deliver(JSON.stringify({ kind: "draft", user_id: "1182", text: "Looks like" }));
      ws.deliver(JSON.stringify({ id: "old", kind: "reply", text: "yesterday", seq: 1, at: 10, replay: true }));
      ws.deliver(JSON.stringify({ id: "ping", kind: "push", text: "gym in 10", seq: 2, at: 20 }));
    });
    expect(browserSpeak).not.toHaveBeenCalled();

    act(() => {
      ws.deliver(JSON.stringify({ id: "r1", kind: "reply", text: "**Clear** and 62.", seq: 3, at: 30 }));
    });
    expect(browserSpeak).toHaveBeenCalledExactlyOnceWith("**Clear** and 62.", { lang: "en", onPhase: expect.any(Function) });

    act(() => {
      ws.deliver(JSON.stringify({ id: "r2", kind: "reply", text: "Anything else?", seq: 4, at: 40 }));
    });
    expect(browserSpeak).toHaveBeenCalledOnce();
  });

  it("shows Kit's voice in the header and on the bar, and says why a reply stayed silent", async () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognizer);
    vi.mocked(browserSpeak).mockClear();
    let tell: ((ev: SpeakEvent) => void) | undefined;
    const arm = () => vi.mocked(browserSpeak).mockImplementationOnce(async (_text, deps) => {
      tell = deps?.onPhase;
      tell?.({ phase: "fetching" });
      return true;
    });
    const ws = await connectSpike({ voice: true });
    act(() => {
      ws.open();
    });
    voiceOn();
    const banner = screen.getByRole("banner");
    const bar = () => screen.getByRole("button", { name: "Hold to talk" });

    arm();
    holdAndSay("hello");
    await waitFor(() => expect(ws.send).toHaveBeenCalledTimes(1));
    act(() => {
      ws.deliver(JSON.stringify({ id: "r1", kind: "reply", text: "hi there", seq: 1, at: 10 }));
    });
    expect(banner.textContent).toContain("· voice…");
    expect(bar().textContent).toBe("Fetching voice…");
    act(() => tell?.({ phase: "playing" }));
    expect(banner.textContent).toContain("· speaking");
    expect(bar().textContent).toBe("Speaking · hold to cut in");
    expect(screen.getByRole("button", { name: "Voice on" }).className).toContain("animate-pulse");
    act(() => tell?.({ phase: "done" }));
    expect(banner.textContent).not.toContain("speaking");
    expect(bar().textContent).toBe("Hold to talk");
    expect(screen.getByRole("button", { name: "Voice on" }).className).not.toContain("animate-pulse");
    expect(screen.queryByRole("alert")).toBeNull();

    arm();
    holdAndSay("again");
    await waitFor(() => expect(ws.send).toHaveBeenCalledTimes(2));
    act(() => {
      ws.deliver(JSON.stringify({ id: "r2", kind: "reply", text: "still here", seq: 2, at: 20 }));
    });
    act(() => tell?.({ phase: "failed", reason: "vendor" }));
    expect(banner.textContent).not.toContain("voice…");
    expect(bar().textContent).toBe("Hold to talk");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/Kit's voice failed at Google/);
    // Under the thread, right above the bar — not tucked under the header.
    expect(banner.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("still here").compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(alert.compareDocumentPosition(bar()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a typed turn does not arm the speaker, and a refusal disarms it", async () => {
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognizer);
    vi.mocked(browserSpeak).mockClear();
    const ws = await connectSpike({ voice: true });
    act(() => {
      ws.open();
    });
    fireEvent.change(screen.getByPlaceholderText(/Message Kit/), { target: { value: "typed" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(ws.send).toHaveBeenCalledTimes(1));
    act(() => {
      ws.deliver(JSON.stringify({ id: "r1", kind: "reply", text: "read this", seq: 1, at: 10 }));
    });
    expect(browserSpeak).not.toHaveBeenCalled();
    const typed = JSON.parse(String(ws.send.mock.calls[0]?.[0])) as { context?: unknown };
    expect(typed.context).toEqual({ surface: "browser" });

    voiceOn();
    holdAndSay("spoken");
    await waitFor(() => expect(ws.send).toHaveBeenCalledTimes(2));
    const spokenId = (JSON.parse(String(ws.send.mock.calls[1]?.[0])) as { id: string }).id;
    act(() => {
      ws.deliver(JSON.stringify({ kind: "error", id: spokenId, text: "rate" }));
      ws.deliver(JSON.stringify({ id: "r2", kind: "reply", text: "later", seq: 2, at: 20 }));
    });
    expect(browserSpeak).not.toHaveBeenCalled();
  });

  it("paints transcript replay frames on connect", async () => {
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    act(() => {
      ws.deliver(JSON.stringify({
        id: "old-in",
        kind: "inbound",
        text: "last hatch",
        seq: 1,
        at: 10,
        replay: true,
      }));
      ws.deliver(JSON.stringify({
        id: "old-out",
        kind: "reply",
        text: "latched",
        seq: 2,
        at: 20,
        replay: true,
      }));
    });
    const items = screen.getAllByRole("listitem");
    expect(items.map((el) => el.textContent)).toEqual(["last hatch", "latched"]);
  });

  it("keeps a draft last while catch-up slots in above it", async () => {
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    act(() => {
      ws.deliver(JSON.stringify({ kind: "draft", user_id: "1182", text: "⏳ spinning up" }));
      ws.deliver(JSON.stringify({
        id: "late",
        kind: "inbound",
        text: "I already sent this",
        seq: 1,
        at: 10,
      }));
    });
    const items = screen.getAllByRole("listitem");
    expect(items.map((el) => el.textContent)).toEqual(["I already sent this", "⏳ spinning up"]);
  });

  it("acks the highest seq after out-of-order catch-up", async () => {
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    act(() => {
      ws.deliver(JSON.stringify({ id: "b", kind: "reply", text: "second", seq: 2, at: 20 }));
      ws.deliver(JSON.stringify({ id: "a", kind: "reply", text: "first", seq: 1, at: 10 }));
    });
    act(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const next = liveSocket();
    act(() => {
      next.open();
    });
    expect(next.send).toHaveBeenCalledWith(JSON.stringify({ kind: "ack", since: "2" }));
  });

  it("does not yank the thread to the bottom after you scroll up", async () => {
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    const thread = document.querySelector(".overflow-y-auto") as HTMLDivElement;
    Object.defineProperty(thread, "scrollHeight", { configurable: true, get: () => 1000 });
    Object.defineProperty(thread, "clientHeight", { configurable: true, get: () => 200 });
    Object.defineProperty(thread, "scrollTop", { configurable: true, writable: true, value: 0 });
    fireEvent.scroll(thread);
    act(() => {
      ws.deliver(JSON.stringify({ kind: "draft", user_id: "1182", text: "⏳ spinning up" }));
    });
    expect(thread.scrollTop).toBe(0);
    act(() => {
      ws.deliver(JSON.stringify({ kind: "draft", user_id: "1182", text: "⏳ spinning up\nMaking Calls" }));
    });
    expect(thread.scrollTop).toBe(0);
  });

  it("stays pinned to the bottom while a draft grows", async () => {
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    const thread = document.querySelector(".overflow-y-auto") as HTMLDivElement;
    Object.defineProperty(thread, "scrollHeight", { configurable: true, get: () => 1000 });
    Object.defineProperty(thread, "clientHeight", { configurable: true, get: () => 200 });
    Object.defineProperty(thread, "scrollTop", { configurable: true, writable: true, value: 800 });
    fireEvent.scroll(thread);
    act(() => {
      ws.deliver(JSON.stringify({ kind: "draft", user_id: "1182", text: "⏳ spinning up" }));
    });
    expect(thread.scrollTop).toBe(1000);
  });

  it("paints a flushed cron push as a Kit bubble", async () => {
    const ws = await connectSpike();
    act(() => {
      ws.deliver(JSON.stringify({ id: "cron-325-1", kind: "push", text: "leave by 8" }));
    });
    expect(await screen.findByText("leave by 8")).toBeTruthy();
    expect(screen.getByText("ping")).toBeTruthy();
  });

  it("drops the phone socket when hidden and does not reconnect until visible", async () => {
    const first = await connectSpike();
    act(() => {
      first.open();
    });
    expect(FakeSocket.instances).toHaveLength(1);
    vi.useFakeTimers();
    act(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(first.readyState).toBe(FakeSocket.CLOSED);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(FakeSocket.instances).toHaveLength(1);
    act(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("keeps a send pending when the socket is not open", async () => {
    await connectSpike();
    expect(liveSocket().readyState).not.toBe(FakeSocket.OPEN);
    fireEvent.change(screen.getByPlaceholderText(/Message Kit/), { target: { value: "hello kit" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("hello kit")).toBeTruthy();
    expect(screen.getByText("sending")).toBeTruthy();
    expect(liveSocket().send).not.toHaveBeenCalled();
  });

  it("sends a second message even when GPS never returns", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition() {
          // hang — a real OS lock with no GPS / a stuck permission
        },
      },
    });
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    vi.useFakeTimers();
    const box = screen.getByPlaceholderText(/Message Kit/) as HTMLTextAreaElement;
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "first" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByText("first")).toBeTruthy();
    expect(box.disabled).toBe(false);
    await act(async () => {
      await Promise.resolve();
    });
    expect(ws.send).toHaveBeenCalled();
    fireEvent.change(box, { target: { value: "second" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByText("second")).toBeTruthy();
    expect(box.disabled).toBe(false);
    expect(box.value).toBe("");
  });

  it("does not lock compose on a socket error while the connection is still open", async () => {
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    const box = screen.getByPlaceholderText(/Message Kit/) as HTMLTextAreaElement;
    expect(box.disabled).toBe(false);
    act(() => {
      ws.onerror?.(new Event("error"));
    });
    expect(screen.getByText("live")).toBeTruthy();
    expect(box.disabled).toBe(false);
    fireEvent.change(box, { target: { value: "still here" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("still here")).toBeTruthy();
  });

  it("clears pending when an ack for that id arrives", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    fireEvent.change(screen.getByPlaceholderText(/Message Kit/), { target: { value: "hello kit" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("hello kit")).toBeTruthy();
    expect(screen.getByText("sending")).toBeTruthy();
    act(() => {
      ws.deliver(JSON.stringify({ kind: "ack", id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }));
    });
    expect(screen.getByText("hello kit")).toBeTruthy();
    expect(screen.queryByText("sending")).toBeNull();
  });

  it("marks your bubble Not sent when the mailbox refuses it by id, instead of painting a Kit bubble", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    fireEvent.change(screen.getByPlaceholderText(/Message Kit/), { target: { value: "hello kit" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("hello kit")).toBeTruthy();
    expect(screen.getByText("sending")).toBeTruthy();
    act(() => {
      ws.deliver(JSON.stringify({ kind: "error", text: "rate", id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }));
    });
    expect(screen.getByRole("alert").textContent).toBe("Not sent — too much too fast. Wait a minute, then try again.");
    expect(screen.queryByText("sending")).toBeNull();
    expect(screen.queryByText("rate")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("hello kit").closest("div[class*='bg-you']")).toBeTruthy();
    act(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const next = liveSocket();
    act(() => {
      next.open();
    });
    expect(next.send).not.toHaveBeenCalledWith(expect.stringContaining("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"));
  });

  it("marks the newest pending bubble when an old mailbox sends an error without an id", async () => {
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    const box = screen.getByPlaceholderText(/Message Kit/);
    fireEvent.change(box, { target: { value: "first" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("first")).toBeTruthy();
    fireEvent.change(box, { target: { value: "second" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("second")).toBeTruthy();
    act(() => {
      ws.deliver(JSON.stringify({ kind: "error", text: "too large" }));
    });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Not sent — too big for the room.");
    expect(alert.closest("li")?.textContent).toContain("second");
    expect(screen.getByText("first").closest("li")?.textContent).toContain("sending");
  });

  it("encodes photos at the long edge picked in Settings → Photo size and remembers it", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 4032, height: 3024, close() {} }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    const widths: number[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb) {
      widths.push(this.width);
      cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }));
    });
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    const picker = screen.getByLabelText("Photo size") as HTMLSelectElement;
    expect(picker.value).toBe("medium");
    expect([...picker.options].map((o) => o.textContent)).toEqual(["Full · 1600 px", "Medium · 1024 px", "Small · 640 px"]);
    fireEvent.change(picker, { target: { value: "small" } });
    expect(picker.value).toBe("small");
    expect(localStorage.getItem("pendant.photo")).toBe("small");
    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    const input = document.querySelector("form input[type=file]") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([1])], "IMG_0002.jpg", { type: "image/jpeg" })] } });
    // Attach stages; nothing is on the wire until Send.
    const staged = await screen.findByAltText("Photo to send") as HTMLImageElement;
    expect(staged.src.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(widths).toEqual([640]);
    expect(ws.send).not.toHaveBeenCalledWith(expect.stringContaining("images"));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(ws.send).toHaveBeenCalledWith(expect.stringContaining("data:image/jpeg;base64,"));
    });
    expect(document.querySelector("li img[src^='data:image/jpeg;base64,']")).toBeTruthy();
    expect(screen.getByText("sending")).toBeTruthy();
    expect(screen.queryByAltText("Photo to send")).toBeNull();
  });

  it("sends caption and photo as one turn, and Remove takes the photo off the draft", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 800, height: 600, close() {} }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, cb) {
      cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }));
    });
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    const input = document.querySelector("form input[type=file]") as HTMLInputElement;
    const shot = new File([new Uint8Array([1])], "IMG_0003.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [shot] } });
    expect(await screen.findByAltText("Photo to send")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(screen.queryByAltText("Photo to send")).toBeNull();
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { files: [shot] } });
    expect(await screen.findByAltText("Photo to send")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Message Kit/), { target: { value: "this hatch?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(ws.send).toHaveBeenCalledTimes(1);
    });
    const frame = JSON.parse(ws.send.mock.calls[0]?.[0] ?? "{}") as { kind?: string; text?: string; images?: { url: string }[] };
    expect(frame.kind).toBe("inbound");
    expect(frame.text).toBe("this hatch?");
    expect(frame.images).toHaveLength(1);
    expect(frame.images?.[0]?.url.startsWith("data:image/jpeg;base64,")).toBe(true);
    const bubble = screen.getByText("this hatch?").closest("li");
    expect(bubble?.querySelector("img[src^='data:image/jpeg;base64,']")).toBeTruthy();
    expect(screen.queryByAltText("Photo to send")).toBeNull();
  });

  it("reads Settings → Photo size back from storage on load", async () => {
    window.localStorage.setItem("pendant.photo", "full");
    stubAuth(true);
    render(<PhoneShell />);
    expect(await screen.findByText("live")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    expect((screen.getByLabelText("Photo size") as HTMLSelectElement).value).toBe("full");
  });

  it("says why a photo could not be prepared instead of hiding it in a tooltip", async () => {
    vi.stubGlobal("createImageBitmap", async () => {
      throw new Error("nope");
    });
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    // Compose's picker, not the avatar's in the header.
    const input = document.querySelector("form input[type=file]") as HTMLInputElement;
    expect(input).toBeTruthy();
    const file = new File([new Uint8Array([1, 2, 3])], "IMG_0001.heic", { type: "image/heic" });
    fireEvent.change(input, { target: { files: [file] } });
    expect((await screen.findByRole("alert")).textContent).toBe("Photo not sent — couldn't read that image.");
    expect(ws.send).not.toHaveBeenCalledWith(expect.stringContaining("images"));
    expect(screen.getByText(/Nothing yet/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Message Kit/), { target: { value: "text instead" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("text instead")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("toasts a hidden reply when notifications are granted", async () => {
    const constructed: string[] = [];
    class FakeNotification {
      static permission: NotificationPermission = "granted";
      constructor(title: string) {
        constructed.push(title);
      }
    }
    vi.stubGlobal("Notification", FakeNotification);
    const ws = await connectSpike();
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    act(() => {
      ws.deliver(JSON.stringify({ id: "r1", kind: "reply", text: "yo from kit" }));
    });
    expect(await screen.findByText("yo from kit")).toBeTruthy();
    await act(async () => {
      await Promise.resolve();
    });
    expect(constructed).toEqual(["Kit"]);
  });

  it("does not duplicate a row when the same frame id arrives twice", async () => {
    const ws = await connectSpike();
    const payload = JSON.stringify({ id: "r1", kind: "reply", text: "yo from kit" });
    act(() => {
      ws.deliver(payload);
      ws.deliver(payload);
    });
    expect(await screen.findByText("yo from kit")).toBeTruthy();
    expect(screen.getAllByText("yo from kit")).toHaveLength(1);
  });

  it("paints a flushed inbound as your bubble next to Kit", async () => {
    const ws = await connectSpike();
    act(() => {
      ws.deliver(JSON.stringify({ id: "in-1", kind: "inbound", text: "from me" }));
      ws.deliver(JSON.stringify({ id: "r1", kind: "reply", text: "from kit" }));
    });
    expect(await screen.findByText("from me")).toBeTruthy();
    expect(screen.getByText("from kit")).toBeTruthy();
    const mine = screen.getByText("from me").closest("div[class*='bg-you']");
    const kit = screen.getByText("from kit").closest("div[class*='bg-kit']");
    expect(mine).toBeTruthy();
    expect(kit).toBeTruthy();
  });

  it("refetches Kit's backdrop on the notice without painting a bubble", async () => {
    const ws = await connectSpike();
    const fetches: string[] = [];
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo) => {
      fetches.push(String(input));
      return inner(input);
    });
    act(() => {
      ws.open();
    });
    act(() => {
      ws.deliver(JSON.stringify({ kind: "backdrop", rev: 42 }));
    });
    await waitFor(() => expect(fetches.some((u) => u.includes("/api/backdrop?slug=kit&v=42"))).toBe(true));
    expect(screen.getByText(/Nothing yet/)).toBeTruthy();
    expect(screen.queryByText("42")).toBeNull();
    act(() => {
      ws.deliver(JSON.stringify({ kind: "backdrop", rev: 0 }));
    });
    await waitFor(() => expect(fetches.filter((u) => u.includes("/api/backdrop?slug=kit")).length).toBeGreaterThanOrEqual(2));
    expect(fetches.at(-1)).toContain("/api/backdrop?slug=kit");
    expect(fetches.at(-1)).not.toContain("v=");
  });

  it("keeps the backdrop off the thread when the setting is off", async () => {
    window.localStorage.setItem("pendant.backdrop", "off");
    const ws = await connectSpike();
    const fetches: string[] = [];
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo) => {
      fetches.push(String(input));
      return inner(input);
    });
    act(() => {
      ws.open();
    });
    act(() => {
      ws.deliver(JSON.stringify({ kind: "backdrop", rev: 42 }));
    });
    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    const toggle = screen.getByLabelText("Backdrop") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(fetches.some((u) => u.includes("/api/backdrop"))).toBe(false);
    fireEvent.click(toggle);
    expect(window.localStorage.getItem("pendant.backdrop")).toBe("on");
    await waitFor(() => expect(fetches.some((u) => u.includes("/api/backdrop?slug=kit&v=42"))).toBe(true));
  });

  it("paints Kit's room theme from the notice without a bubble", async () => {
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    act(() => {
      ws.deliver(JSON.stringify({ kind: "theme", theme: "noir" }));
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("noir");
    expect(window.localStorage.getItem("pendant.roomTheme")).toBe("noir");
    expect(window.localStorage.getItem("pendant.theme")).not.toBe("noir");
    expect(screen.getByText(/Nothing yet/)).toBeTruthy();
    expect(screen.queryByText("noir")).toBeNull();
    act(() => {
      ws.deliver(JSON.stringify({ kind: "theme", theme: null }));
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("boom");
    expect(window.localStorage.getItem("pendant.roomTheme")).toBeNull();
  });

  it("keeps your pick when Follow Kit's mood is off", async () => {
    window.localStorage.setItem("pendant.followTheme", "off");
    window.localStorage.setItem("pendant.theme", "inlay");
    document.documentElement.setAttribute("data-theme", "inlay");
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    const toggle = screen.getByLabelText("Follow Kit's mood") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    act(() => {
      ws.deliver(JSON.stringify({ kind: "theme", theme: "noir" }));
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("inlay");
    expect(window.localStorage.getItem("pendant.roomTheme")).toBe("noir");
    fireEvent.click(toggle);
    expect(window.localStorage.getItem("pendant.followTheme")).toBe("on");
    expect(document.documentElement.getAttribute("data-theme")).toBe("noir");
  });

  it("picking a theme in settings stops following Kit", async () => {
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    act(() => {
      ws.deliver(JSON.stringify({ kind: "theme", theme: "noir" }));
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("noir");
    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    expect((screen.getByLabelText("Follow Kit's mood") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "color theme" }));
    fireEvent.click(screen.getByRole("option", { name: "Ember" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("ember");
    expect(window.localStorage.getItem("pendant.theme")).toBe("ember");
    expect(window.localStorage.getItem("pendant.followTheme")).toBe("off");
    expect((screen.getByLabelText("Follow Kit's mood") as HTMLInputElement).checked).toBe(false);
  });

  it("swallows a junk theme id instead of painting a bubble", async () => {
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    act(() => {
      ws.deliver(JSON.stringify({ kind: "theme", theme: "hotpink" }));
    });
    expect(screen.getByText(/Nothing yet/)).toBeTruthy();
    expect(document.documentElement.getAttribute("data-theme")).not.toBe("hotpink");
  });

  it("does not treat inbound ack as typing", async () => {
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    act(() => {
      ws.deliver(JSON.stringify({ kind: "ack", id: "msg-1" }));
    });
    expect(screen.getByText("live")).toBeTruthy();
    expect(screen.queryByText(/typing/)).toBeNull();
    expect(screen.getByText(/Nothing yet/)).toBeTruthy();
  });

  it("shows typing from the crane and clears it on reply", async () => {
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    act(() => {
      ws.deliver(JSON.stringify({ kind: "typing", user_id: "1182" }));
    });
    expect(screen.getByText(/typing/)).toBeTruthy();
    expect(screen.getByText(/Nothing yet/)).toBeTruthy();
    act(() => {
      ws.deliver(JSON.stringify({ id: "r1", kind: "reply", text: "yo from kit" }));
    });
    expect(await screen.findByText("yo from kit")).toBeTruthy();
    expect(screen.queryByText(/typing/)).toBeNull();
  });

  it("drops typing after the TTL if no reply arrives", async () => {
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    vi.useFakeTimers();
    act(() => {
      ws.deliver(JSON.stringify({ kind: "typing", user_id: "1182" }));
    });
    expect(screen.getByText(/typing/)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(TYPING_TTL_MS - 1);
    });
    expect(screen.getByText(/typing/)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText(/typing/)).toBeNull();
  });

  it("replaces a draft bubble in place and does not type from it", async () => {
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    act(() => {
      ws.deliver(JSON.stringify({ kind: "draft", user_id: "1182", text: "⏳ spinning up" }));
    });
    expect(await screen.findByText("⏳ spinning up")).toBeTruthy();
    expect(screen.queryByText(/typing/)).toBeNull();
    act(() => {
      ws.deliver(JSON.stringify({ kind: "draft", user_id: "1182", text: "Making Calls: ✓" }));
    });
    expect(await screen.findByText("Making Calls: ✓")).toBeTruthy();
    expect(screen.queryByText("⏳ spinning up")).toBeNull();
    const draftNode = screen.getByText("Making Calls: ✓").closest("li");
    act(() => {
      ws.deliver(JSON.stringify({ id: "r1", kind: "reply", text: "You rode 21mi." }));
    });
    const reply = await screen.findByText("You rode 21mi.");
    expect(reply.closest("li")).toBe(draftNode);
    expect(screen.queryByText("Making Calls: ✓")).toBeNull();
  });

  it("promotes a complete draft to a reply without a second bubble", async () => {
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    act(() => {
      ws.deliver(JSON.stringify({ kind: "draft", user_id: "1182", text: "Hello there" }));
    });
    expect((await screen.findByText("Hello there")).closest(".italic")).toBeTruthy();
    act(() => {
      ws.deliver(JSON.stringify({ id: "r1", kind: "reply", text: "Hello there" }));
    });
    expect(screen.getAllByText("Hello there")).toHaveLength(1);
    expect(screen.getByText("Hello there").closest(".italic")).toBeNull();
  });

  it("drops an empty draft without leaving a bubble", async () => {
    const ws = await connectSpike();
    act(() => {
      ws.open();
    });
    act(() => {
      ws.deliver(JSON.stringify({ kind: "draft", user_id: "1182", text: "⏳ spinning up" }));
    });
    expect(await screen.findByText("⏳ spinning up")).toBeTruthy();
    act(() => {
      ws.deliver(JSON.stringify({ kind: "draft", user_id: "1182", text: "" }));
    });
    expect(screen.queryByText("⏳ spinning up")).toBeNull();
    expect(screen.getByText(/Nothing yet/)).toBeTruthy();
  });

  it("picks from /me cranes and still lets you type another slug", async () => {
    stubOidc({ sub: DEV_USER.sub, email: DEV_USER.email, cranes: ["kit", "ada"] });
    stubSocket();
    render(<PhoneShell />);
    expect(await screen.findByText("Kit")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    const picker = screen.getByLabelText("Agent") as HTMLSelectElement;
    expect(picker.value).toBe("kit");
    fireEvent.change(picker, { target: { value: "ada" } });
    expect(picker.value).toBe("ada");
    expect(screen.getAllByText("Ada").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Agent name")).toBeTruthy();
    expect(window.location.search).not.toContain("sub=");
  });

  it("opens the first /me crane instead of the kit default", async () => {
    stubOidc({ sub: DEV_USER.sub, email: DEV_USER.email, cranes: ["tim"] });
    stubSocket();
    render(<PhoneShell />);
    expect(await screen.findByText("Tim")).toBeTruthy();
    await waitFor(() => {
      expect(FakeSocket.instances.some((s) => s.url.includes("/ws/tim"))).toBe(true);
    });
    expect(FakeSocket.instances.some((s) => s.url.includes("/ws/kit"))).toBe(false);
  });

  it("shows email and sub when the directory is empty", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: write },
    });
    stubOidc({ sub: DEV_USER.sub, email: "bob@example.com", cranes: [] });
    stubSocket();
    const fetches: string[] = [];
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo) => {
      fetches.push(String(input));
      return inner(input);
    });
    render(<PhoneShell />);
    expect(await screen.findByText(/not on any crane yet/i)).toBeTruthy();
    expect(screen.getByText("bob@example.com")).toBeTruthy();
    expect(screen.getByText(DEV_USER.sub)).toBeTruthy();
    expect(FakeSocket.instances).toHaveLength(0);
    expect(fetches.some((u) => u.includes("/api/avatar?slug=kit"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(write).toHaveBeenCalledWith(`bob@example.com\n${DEV_USER.sub}`);
    expect(window.location.search).not.toContain("sub=");
  });

  it("does not dial a typed slug until /me lists it", async () => {
    stubOidc({ sub: DEV_USER.sub, email: "bob@example.com", cranes: [] });
    stubSocket();
    const fetches: string[] = [];
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo) => {
      fetches.push(String(input));
      return inner(input);
    });
    render(<PhoneShell />);
    expect(await screen.findByText(/not on any crane yet/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Agent name"), { target: { value: "tim" } });
    expect(await screen.findByText(/not on any crane yet/i)).toBeTruthy();
    expect(FakeSocket.instances).toHaveLength(0);
    expect(fetches.some((u) => u.includes("/api/avatar?slug=tim"))).toBe(false);
    expect(fetches.some((u) => u.includes("/api/auth/me?slug=tim"))).toBe(true);
  });

  it("dials a typed slug after /me admits it", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/auth/config")) {
        return Response.json({ mode: "oidc", google: true, dev: false });
      }
      if (url.includes("/api/auth/me")) {
        const cranes = url.includes("slug=tim") ? ["tim"] : [];
        return Response.json({ sub: DEV_USER.sub, email: "bob@example.com", cranes });
      }
      return new Response(null, { status: 404 });
    });
    stubSocket();
    render(<PhoneShell />);
    expect(await screen.findByText(/not on any crane yet/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Agent name"), { target: { value: "tim" } });
    expect(await screen.findByPlaceholderText(/Message Tim/)).toBeTruthy();
    expect(screen.queryByText(/not on any crane yet/i)).toBeNull();
    await waitFor(() => {
      expect(FakeSocket.instances.some((s) => s.url.includes("/ws/tim"))).toBe(true);
    });
    expect(FakeSocket.instances.some((s) => s.url.includes("/ws/kit"))).toBe(false);
  });

  it("paints give it a minute when /me is rate-limited", async () => {
    let meCalls = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/auth/config")) {
        return Response.json({ mode: "oidc", google: true, dev: false });
      }
      if (url.includes("/api/auth/me")) {
        meCalls += 1;
        if (meCalls === 1) {
          return Response.json({ sub: DEV_USER.sub, email: "bob@example.com", cranes: [] });
        }
        return new Response(null, { status: 429 });
      }
      return new Response(null, { status: 404 });
    });
    stubSocket();
    render(<PhoneShell />);
    expect(await screen.findByText(/not on any crane yet/i)).toBeTruthy();
    expect(await screen.findByText(/give it a minute/i)).toBeTruthy();
    expect(FakeSocket.instances).toHaveLength(0);
  });
});

function stubOidc(me: { sub: string; email?: string; cranes: string[] } | null) {
  vi.stubGlobal("fetch", async (input: RequestInfo) => {
    const url = String(input);
    if (url.includes("/api/auth/config")) {
      return Response.json({ mode: "oidc", google: true, dev: false });
    }
    if (url.includes("/api/auth/me")) {
      return me ? Response.json(me) : new Response(null, { status: 401 });
    }
    return new Response(null, { status: 404 });
  });
}
