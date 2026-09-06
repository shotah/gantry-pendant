import { describe, expect, it } from "vitest";
import { CONTEXT_JSON_MAX, FRAME_BYTES_MAX, TEXT_MAX } from "@/lib/mailbox/caps";
import { encodeFrame, hasGeo, isBareGeo, parseFrame, peerOf, type ParseResult } from "@/lib/mailbox/frame";

function failMsg(r: ParseResult): string {
  return r.ok ? "ok" : r.error;
}

describe("frame", () => {
  it("parses text both ways", () => {
    const got = parseFrame(JSON.stringify({ text: "hi" }));
    expect(got).toEqual({ ok: true, frame: { text: "hi" }, bytes: expect.any(Number) });
    if (got.ok) {
      expect(encodeFrame(got.frame)).toBe('{"text":"hi"}');
    }
  });

  it("keeps geo on context and does not invent [location] text", () => {
    const raw = {
      text: "near me",
      context: {
        at: "2026-09-04T12:00:00.000Z",
        tz: "America/Los_Angeles",
        geo: { lat: 47.6, lon: -122.3, accuracy_m: 12, heading: 90, speed_mps: 1, alt_m: 10 },
        battery: { pct: 80, charging: false },
        net: "cellular",
      },
    };
    const got = parseFrame(JSON.stringify(raw));
    expect(got.ok).toBe(true);
    if (got.ok) {
      expect(got.frame.text).toBe("near me");
      expect(got.frame.text).not.toContain("[location]");
      expect(got.frame.context?.geo).toEqual({
        lat: 47.6,
        lon: -122.3,
        accuracy_m: 12,
        heading: 90,
        speed_mps: 1,
        alt_m: 10,
      });
      expect(hasGeo(got.frame)).toBe(true);
      expect(isBareGeo(got.frame)).toBe(false);
    }
  });

  it("treats geo-only as a silent pin", () => {
    const got = parseFrame(JSON.stringify({ context: { geo: { lat: 1, lon: 2 } } }));
    expect(got.ok && isBareGeo(got.frame)).toBe(true);
  });

  it("rejects junk, oversize text, and bad images", () => {
    expect(parseFrame("nope").ok).toBe(false);
    expect(parseFrame("[]").ok).toBe(false);
    expect(parseFrame(JSON.stringify({ text: 1 })).ok).toBe(false);
    expect(parseFrame(JSON.stringify({ kind: "nope" })).ok).toBe(false);
    expect(parseFrame(JSON.stringify({ user_id: 1 })).ok).toBe(false);
    expect(parseFrame(JSON.stringify({ images: { url: "x" } })).ok).toBe(false);
    expect(parseFrame(JSON.stringify({ images: [{ url: "ftp://x" }] })).ok).toBe(false);
    expect(parseFrame(JSON.stringify({ images: [{}] })).ok).toBe(false);
    expect(failMsg(parseFrame(JSON.stringify({ text: "x".repeat(TEXT_MAX + 1) })))).toBe("too large");
  });

  it("caps context and whole-frame bytes", () => {
    const fat = { context: { tz: "x".repeat(CONTEXT_JSON_MAX) } };
    expect(failMsg(parseFrame(JSON.stringify(fat)))).toBe("too large");
    const huge = "x".repeat(FRAME_BYTES_MAX + 1);
    expect(failMsg(parseFrame(huge))).toBe("too large");
  });

  it("accepts one https or data image and drops extra", () => {
    const ok = parseFrame(JSON.stringify({ images: [{ url: "https://example.test/a.jpg" }] }));
    expect(ok.ok).toBe(true);
    const two = parseFrame(JSON.stringify({
      images: [{ url: "https://a" }, { url: "https://b" }],
    }));
    expect(failMsg(two)).toBe("too large");
  });

  it("drops invalid geo and keeps a data-url photo", () => {
    const badGeo = parseFrame(JSON.stringify({ context: { geo: { lat: 100, lon: 0 } } }));
    expect(badGeo.ok && badGeo.frame.context?.geo).toBeUndefined();
    const img = parseFrame(JSON.stringify({ images: [{ url: "data:image/jpeg;base64,aa" }] }));
    expect(img.ok).toBe(true);
    expect(peerOf("phone")).toBe("crane");
    expect(peerOf("crane")).toBe("phone");
    const fromBuf = parseFrame(new TextEncoder().encode('{"text":"buf"}'));
    expect(fromBuf.ok && fromBuf.frame.text).toBe("buf");
  });

  it("accepts a crane cmds catalog", () => {
    const got = parseFrame(JSON.stringify({
      kind: "cmds",
      commands: [{ name: "NEW", hint: "reset this session", args: true }, { name: "nope" }],
    }));
    expect(got.ok && got.frame.kind).toBe("cmds");
    expect(got.ok && got.frame.commands).toEqual([{ name: "new", hint: "reset this session", args: true }]);
  });

  it("accepts a crane allow list and lowercases email", () => {
    const got = parseFrame(JSON.stringify({
      kind: "allow",
      users: [{ sub: "118212345678901234567", email: "Ada@Example.com" }, { email: "bob@example.com" }],
    }));
    expect(got.ok && got.frame.kind).toBe("allow");
    expect(got.ok && got.frame.users).toEqual([
      { sub: "118212345678901234567", email: "ada@example.com" },
      { email: "bob@example.com" },
    ]);
    const stamped = parseFrame(JSON.stringify({
      kind: "inbound",
      text: "hi",
      user_id: "118212345678901234567",
      email: "Ada@Example.com",
    }));
    expect(stamped.ok && stamped.frame.email).toBe("ada@example.com");
  });

  it("parses and encodes a short frame id", () => {
    const got = parseFrame(JSON.stringify({ text: "hi", id: "msg-1" }));
    expect(got.ok && got.frame.id).toBe("msg-1");
    if (got.ok) {
      expect(JSON.parse(encodeFrame(got.frame))).toEqual({ text: "hi", id: "msg-1" });
    }
    expect(parseFrame(JSON.stringify({ id: "x".repeat(129) })).ok).toBe(false);
    expect(parseFrame(JSON.stringify({ id: 1 })).ok).toBe(false);
    expect(parseFrame(JSON.stringify({ since: 1 })).ok).toBe(false);
    expect(parseFrame(JSON.stringify({ text: "hi", user_id: "ada", id: "" })).ok).toBe(true);
  });

  it("keeps ack id and optional since", () => {
    const got = parseFrame(JSON.stringify({ kind: "ack", id: "msg-1", since: "msg-0" }));
    expect(got.ok && got.frame).toEqual({ kind: "ack", id: "msg-1", since: "msg-0" });
    if (got.ok) {
      expect(JSON.parse(encodeFrame(got.frame))).toEqual({ kind: "ack", id: "msg-1", since: "msg-0" });
    }
  });

  it("rejects https images from the phone and still allows data urls", () => {
    const https = parseFrame(JSON.stringify({ images: [{ url: "https://example.test/a.jpg" }] }), { role: "phone" });
    expect(https.ok).toBe(false);
    const data = parseFrame(JSON.stringify({ images: [{ url: "data:image/jpeg;base64,aa" }] }), { role: "phone" });
    expect(data.ok).toBe(true);
  });

  it("allows https images from the crane", () => {
    const crane = parseFrame(JSON.stringify({ images: [{ url: "https://example.test/a.jpg" }] }), { role: "crane" });
    expect(crane.ok).toBe(true);
  });
});
