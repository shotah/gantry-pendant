import { describe, expect, it, vi } from "vitest";
import { fanWebPush, pushPayload } from "@/lib/push/fan";
import type { StoredPush } from "@/lib/push/subscription";
import { encodeBase64Url } from "@/lib/push/vapid";

function row(userId: string, n: number): StoredPush {
  const pub = new Uint8Array(65);
  pub[0] = 0x04;
  const auth = new Uint8Array(16);
  auth[0] = n;
  return {
    userId,
    subscription: {
      endpoint: `https://fcm.googleapis.com/fcm/send/${userId}-${n}`,
      keys: { p256dh: encodeBase64Url(pub), auth: encodeBase64Url(auth) },
    },
    at: n,
  };
}

describe("fan web push", () => {
  it("builds a truncated payload and skips inbound", () => {
    expect(pushPayload({ text: "yo" }, "kit")).toEqual({
      title: "Kit",
      body: "yo",
      tag: "pendant",
    });
    expect(pushPayload({ images: [{ url: "data:image/jpeg;base64,aa" }] }, "  ")).toEqual({
      title: "Kit",
      body: "Photo",
      tag: "pendant",
    });
  });

  it("does not send when the phone socket is live", async () => {
    const send = vi.fn(async () => "ok" as const);
    const gone = await fanWebPush({
      frame: { kind: "reply", user_id: "ada", text: "yo" },
      title: "Kit",
      live: new Set(["ada"]),
      stored: [row("ada", 1)],
      send,
    });
    expect(send).not.toHaveBeenCalled();
    expect(gone.gone).toEqual([]);
  });

  it("sends a cron broadcast to offline phones and drops gone endpoints", async () => {
    const send = vi.fn(async (sub) => sub.endpoint.includes("bob") ? "gone" as const : "ok" as const);
    const ada = row("ada", 1);
    const bob = row("bob", 2);
    const result = await fanWebPush({
      frame: { kind: "push", text: "leave by 8" },
      title: "Kit",
      live: new Set(["ada"]),
      stored: [ada, bob],
      send,
    });
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(bob.subscription, { title: "Kit", body: "leave by 8", tag: "pendant" });
    expect(result.gone).toEqual([bob]);
  });

  it("skips cmds", async () => {
    const send = vi.fn(async () => "ok" as const);
    await fanWebPush({
      frame: { kind: "cmds" },
      title: "Kit",
      live: new Set(),
      stored: [row("ada", 1)],
      send,
    });
    expect(send).not.toHaveBeenCalled();
  });
});
