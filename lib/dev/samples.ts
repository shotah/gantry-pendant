import type { SlashCommand } from "@/lib/mailbox/cmds";
import type { Role } from "@/lib/mailbox/frame";

export const DEV_USER = {
  sub: "118212345678901234567",
  email: "ada@example.com",
  cranes: ["ada"],
};

export const SAMPLE_IDS = ["unsigned", "empty", "cmds", "thread", "ping", "photo", "down", "crane"] as const;

export type SampleId = (typeof SAMPLE_IDS)[number];

export type SampleBubble = {
  id: string;
  from: "you" | "kit";
  text: string;
  kind?: string;
  at: number;
  photo?: string;
};

export type SampleScene = {
  id: SampleId;
  messages: SampleBubble[];
  status: "idle" | "up" | "down";
  gpsHint?: string;
  draft?: string;
  catalog?: SlashCommand[];
};

export const SAMPLE_LINES = {
  threadYou: "On the dock — is the gate still open?",
  threadKitLatch: "Gate's on the latch until 21:00. I'll ping you at 20:40 if you're still out.",
  threadYouLeave: "Leave by 20:50 then.",
  threadKit: "Leave-by 20:50. Pin is this-send, ±12m.",
  ping: "20:40 — still on the dock? Gate latches in twenty.",
  pingYou: "Walking back.",
  pingKit: "I'll hush.",
  photoYou: "This the right hatch?",
  photoKit: "Yes — port side, yellow tape. Don't step the wet plate.",
  craneKit: "Gate's on the latch until 21:00.",
} as const;

/** Shot/loopback stand-in only. Live catalog comes from the crane cmds frame. */
export const SAMPLE_COMMANDS: SlashCommand[] = [
  { name: "new", hint: "reset this session's history" },
  { name: "status", hint: "uptime, model, history, tools, turns" },
  { name: "brief", hint: "hold a prefix ~6h", args: true },
];

export const MOCK_REPLIES = [
  "Heard. I'll watch the latch.",
  "Pin updated. Gate is still on until 21:00.",
  "Ok — ping at 20:40 if you're still out.",
] as const;

/** Schematic hatch — mock photo, not a real capture. */
export const MOCK_PHOTO
  = "data:image/svg+xml;charset=utf-8,"
    + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
  <rect width="320" height="200" fill="#1c1917"/>
  <rect x="40" y="28" width="240" height="128" rx="10" fill="#3f2e14" stroke="#a16207" stroke-width="3"/>
  <circle cx="160" cy="92" r="20" fill="#6ee7b7"/>
  <text x="160" y="180" text-anchor="middle" fill="#a8a29e" font-size="14" font-family="sans-serif">hatch · mock</text>
</svg>`,
    );

function bubble(
  id: string,
  from: "you" | "kit",
  text: string,
  extra: Partial<SampleBubble> = {},
): SampleBubble {
  return { id, from, text, at: extra.at ?? 1, ...extra };
}

export function parseSample(v: unknown): SampleId | null {
  return typeof v === "string" && (SAMPLE_IDS as readonly string[]).includes(v)
    ? (v as SampleId)
    : null;
}

export function nextMockReply(sentCount: number): string {
  const i = sentCount % MOCK_REPLIES.length;
  return MOCK_REPLIES[i] ?? MOCK_REPLIES[0];
}

export function sampleScene(id: SampleId, role: Role): SampleScene {
  if (id === "unsigned") {
    return { id, messages: [], status: "idle" };
  }
  if (id === "empty") {
    return {
      id,
      messages: [],
      status: "up",
      gpsHint: role === "phone" ? "GPS attaches on send if the OS allows it." : undefined,
    };
  }
  if (id === "cmds") {
    return {
      id,
      messages: [],
      status: "up",
      gpsHint: role === "phone" ? "GPS attaches on send if the OS allows it." : undefined,
      draft: "/",
      catalog: SAMPLE_COMMANDS,
    };
  }
  if (id === "down") {
    return {
      id,
      messages: [bubble("d1", "you", SAMPLE_LINES.threadYou, { at: 1 })],
      status: "down",
      gpsHint: role === "phone" ? "GPS omitted (denied or unavailable)" : undefined,
    };
  }
  if (id === "ping") {
    return {
      id,
      messages: [
        bubble("p1", "kit", SAMPLE_LINES.ping, { kind: "push", at: 1 }),
        bubble("p2", "you", SAMPLE_LINES.pingYou, { at: 2 }),
        bubble("p3", "kit", SAMPLE_LINES.pingKit, { at: 3 }),
      ],
      status: "up",
      gpsHint: role === "phone" ? "pin ±12m this send" : undefined,
    };
  }
  if (id === "photo") {
    return {
      id,
      messages: [
        bubble("h1", "you", SAMPLE_LINES.photoYou, { at: 1, photo: MOCK_PHOTO }),
        bubble("h2", "kit", SAMPLE_LINES.photoKit, { at: 2 }),
      ],
      status: "up",
      gpsHint: role === "phone" ? "pin ±8m this send" : undefined,
    };
  }
  if (id === "crane") {
    return {
      id,
      messages: [
        bubble("c1", "you", SAMPLE_LINES.threadYou, { at: 1 }),
        bubble("c2", "kit", SAMPLE_LINES.craneKit, { at: 2 }),
      ],
      status: "up",
    };
  }
  return {
    id: "thread",
    messages: [
      bubble("t1", "you", SAMPLE_LINES.threadYou, { at: 1 }),
      bubble("t2", "kit", SAMPLE_LINES.threadKitLatch, { at: 2 }),
      bubble("t3", "you", SAMPLE_LINES.threadYouLeave, { at: 3 }),
      bubble("t4", "kit", SAMPLE_LINES.threadKit, { at: 4 }),
    ],
    status: "up",
    gpsHint: role === "phone" ? "pin ±12m this send" : undefined,
  };
}
