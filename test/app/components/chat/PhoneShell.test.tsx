/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhoneShell } from "@/app/components/chat/PhoneShell";
import { DEV_USER, MOCK_REPLIES, SAMPLE_LINES } from "@/lib/dev/samples";
import { TYPING_TTL_MS } from "@/lib/mailbox/typing";
import { clearGeoCache } from "@/lib/phone/geo";

function stubAuth(dev: boolean) {
  vi.stubGlobal("fetch", async (input: RequestInfo) => {
    const url = String(input);
    if (url.includes("/api/auth/config")) {
      return Response.json({ mode: "spike", google: false, dev });
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

async function connectSpike() {
  stubAuth(true);
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
  window.localStorage.removeItem("pendant.font");
  document.documentElement.removeAttribute("data-font");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
  window.localStorage.removeItem("pendant.geo");
  window.localStorage.removeItem("pendant.font");
  document.documentElement.removeAttribute("data-font");
  Reflect.deleteProperty(navigator, "geolocation");
  Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(document, "hidden");
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
    expect(shellClass).toEqual(expect.arrayContaining(["h-dvh", "overflow-hidden"]));
    expect(shellClass).not.toContain("min-h-dvh");
    const thread = shell?.querySelector(".overflow-y-auto");
    expect(thread?.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["min-h-0", "flex-1", "overflow-y-auto"]),
    );
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
    expect(screen.queryByRole("button", { name: "Change Kit's photo" })).toBeNull();
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
    expect(screen.queryByRole("radiogroup", { name: "Font size" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open crane stand-in" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "settings" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(screen.getByText(/Cast, save and share/)).toBeTruthy();
    expect(screen.getByLabelText("Agent name")).toBeTruthy();
    expect((screen.getByLabelText("Agent name") as HTMLInputElement).value).toBe("kit");
    expect(screen.getByLabelText("Agent access secret")).toBeTruthy();
    expect(screen.getByRole("button", { name: "color theme" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Font size" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Small" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("button", { name: "Enable notifications" })).toBeTruthy();
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
    fireEvent.click(screen.getByRole("radio", { name: "Large" }));
    expect(document.documentElement.getAttribute("data-font")).toBe("lg");
    expect(localStorage.getItem("pendant.font")).toBe("lg");
    expect(screen.getByRole("radio", { name: "Large" }).getAttribute("aria-checked")).toBe("true");
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
    stubAuth(true);
    render(<PhoneShell />);
    expect(await screen.findByText("live")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "attach" }));
    fireEvent.click(screen.getByRole("button", { name: "GPS on" }));
    expect(screen.getByRole("button", { name: "GPS off" })).toBeTruthy();
    expect(screen.getByText("GPS off")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Message Kit/), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("hi")).toBeTruthy();
    expect(geo).not.toHaveBeenCalled();
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
    expect(ws.send).toHaveBeenCalled();
    const frame = JSON.parse(String(ws.send.mock.calls[0]?.[0])) as {
      text?: string;
      kind?: string;
      context?: { geo?: { lat: number; lon: number; accuracy_m?: number } };
    };
    expect(frame.kind).toBe("inbound");
    expect(frame.text).toBe("near me");
    expect(frame.text).not.toContain("[location]");
    expect(frame.context?.geo).toEqual({ lat: 47.6, lon: -122.3, accuracy_m: 8 });
    expect(screen.getByRole("button", { name: "attach" }).getAttribute("title")).toBe("pin ±8m this send");
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
    expect(frame.context?.geo).toEqual({ lat: 1, lon: 2, accuracy_m: 5 });
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
    act(() => {
      ws.deliver(JSON.stringify({ id: "r1", kind: "reply", text: "You rode 21mi." }));
    });
    expect(await screen.findByText("You rode 21mi.")).toBeTruthy();
    expect(screen.queryByText("Making Calls: ✓")).toBeNull();
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
    expect(FakeSocket.instances.some((s) => s.url.includes("/ws/tim"))).toBe(true);
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
    expect(await screen.findByText("Tim")).toBeTruthy();
    expect(screen.queryByText(/not on any crane yet/i)).toBeNull();
    expect(FakeSocket.instances.some((s) => s.url.includes("/ws/tim"))).toBe(true);
    expect(FakeSocket.instances.some((s) => s.url.includes("/ws/kit"))).toBe(false);
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
