#!/usr/bin/env node
/**
 * Headless Chrome shots via CDP (no puppeteer).
 *
 *   PENDANT_DEV=1 in .dev.vars, then `npm run dev`
 *   npm run shot
 *   npm run shot -- http://127.0.0.1:3000 thread ping
 *
 * Samples only paint on loopback with PENDANT_DEV (see lib/dev).
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const base = args[0]?.startsWith("http") ? args[0] : "http://127.0.0.1:3000";
const names = args[0]?.startsWith("http") ? args.slice(1) : args;
const outDir = resolve("assets/docs");
const chrome
  = process.env.CHROME
    || "/var/lib/flatpak/app/com.google.Chrome/current/active/files/extra/chrome";
const port = Number(process.env.CDP_PORT || 9245);
const profile = `/tmp/pendant-chrome-shot-${port}`;

const SHOTS = {
  login: { path: "/login", sel: "[data-shot=login]", text: "Continue with Google", phone: true },
  unsigned: {
    path: "/?sample=unsigned",
    sel: "[data-shot=phone]",
    text: "Sign in with Google to talk",
    phone: true,
  },
  empty: { path: "/?sample=empty", sel: "[data-shot=phone]", text: "Nothing yet", phone: true },
  cmds: {
    path: "/?sample=cmds",
    sel: "[data-shot=phone]",
    text: "These go to the crane, not the chat model",
    phone: true,
  },
  thread: {
    path: "/?sample=thread",
    sel: "[data-shot=phone]",
    text: "Leave-by 20:50",
    phone: true,
  },
  "thread-day": {
    path: "/?sample=thread&theme=day",
    sel: "[data-shot=phone]",
    text: "Leave-by 20:50",
    phone: true,
    theme: "day",
  },
  ping: {
    path: "/?sample=ping",
    sel: "[data-shot=phone]",
    text: "Gate latches in twenty",
    phone: true,
  },
  photo: { path: "/?sample=photo", sel: "[data-shot=phone]", text: "right hatch", phone: true },
  down: { path: "/?sample=down", sel: "[data-shot=phone]", text: "GPS omitted", phone: true },
  crane: {
    path: "/crane?sample=crane",
    sel: "[data-shot=crane]",
    text: "Gate's on the latch until 21:00.",
    phone: true,
  },
};

const wanted = names.length ? names : Object.keys(SHOTS);
for (const n of wanted) {
  if (!SHOTS[n]) {
    throw new Error(`unknown shot ${n}`);
  }
}

mkdirSync(profile, { recursive: true });
mkdirSync(outDir, { recursive: true });

const child = spawn(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitCdp() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) {
        return;
      }
    } catch {
      /* retry */
    }
    await sleep(200);
  }
  throw new Error("chrome CDP did not start");
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        if (msg.error) {
          p.reject(new Error(msg.error.message));
        } else {
          p.resolve(msg.result);
        }
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolveP, reject) => {
      this.pending.set(id, { resolve: resolveP, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function evalJson(cdp, expression) {
  const { result } = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return result?.value;
}

try {
  await waitCdp();
  const listed = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  let pageTarget = Array.isArray(listed)
    ? listed.find((t) => t.type === "page" && t.webSocketDebuggerUrl && !String(t.url ?? "").includes("background"))
    : null;
  if (!pageTarget) {
    const created = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    pageTarget = await created.json();
  }
  if (!pageTarget?.webSocketDebuggerUrl) {
    throw new Error("no page target: " + JSON.stringify(listed));
  }
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolveP, reject) => {
    ws.addEventListener("open", resolveP);
    ws.addEventListener("error", () => reject(new Error("cdp ws")));
  });
  const cdp = new Cdp(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  async function metrics(phone) {
    if (phone) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        mobile: true,
      });
    } else {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: 1440,
        height: 900,
        deviceScaleFactor: 2,
        mobile: false,
      });
    }
  }

  async function goto(url) {
    await cdp.send("Page.navigate", { url });
    for (let i = 0; i < 40; i++) {
      const ready = await evalJson(cdp, "document.readyState");
      if (ready === "complete") {
        break;
      }
      await sleep(250);
    }
    await sleep(400);
  }

  async function waitSel(sel, text, ms = 25000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const ok = await evalJson(
        cdp,
        `Boolean(document.querySelector(${JSON.stringify(sel)})) && ${
          text ? `document.body.innerText.includes(${JSON.stringify(text)})` : "true"
        }`,
      );
      if (ok) {
        return;
      }
      await sleep(250);
    }
    const body = await evalJson(cdp, "document.body?.innerText?.slice(0, 800)");
    throw new Error("timeout waiting for " + sel + " body=" + body);
  }

  async function shotView(file) {
    const png = await cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(resolve(outDir, file), Buffer.from(png.data, "base64"));
    console.log("wrote", file);
  }

  await goto(base + "/login");

  for (const name of wanted) {
    const spec = SHOTS[name];
    await metrics(Boolean(spec.phone));
    const theme = spec.theme || "night";
    await evalJson(
      cdp,
      `localStorage.setItem("pendant.theme", ${JSON.stringify(theme)}); document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)});`,
    );
    await goto(base + spec.path);
    await waitSel(spec.sel, spec.text);
    await evalJson(cdp, "window.scrollTo(0,0)");
    await sleep(500);
    await shotView(`${name}.png`);
  }

  ws.close();
} finally {
  child.kill("SIGTERM");
}
