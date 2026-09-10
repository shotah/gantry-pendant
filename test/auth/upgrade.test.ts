import { describe, expect, it } from "vitest";
import { stampMailboxHeaders, stripUpgradeOp, upgradeOriginOk } from "@/lib/auth/upgrade";

describe("upgradeOriginOk", () => {
  it("allows a missing Origin (Go crane)", () => {
    expect(upgradeOriginOk(null, "https://pendant.example.workers.dev")).toBe(true);
  });

  it("allows Origin equal to the request URL origin", () => {
    expect(upgradeOriginOk("https://pendant.example.workers.dev", "https://pendant.example.workers.dev")).toBe(true);
    expect(upgradeOriginOk("http://127.0.0.1:5173", "http://127.0.0.1:5173")).toBe(true);
  });

  it("rejects a mismatched Origin (scheme, host, or port)", () => {
    expect(upgradeOriginOk("https://evil.example", "https://pendant.example.workers.dev")).toBe(false);
    expect(upgradeOriginOk("http://pendant.example.workers.dev", "https://pendant.example.workers.dev")).toBe(false);
    expect(upgradeOriginOk("https://x.test:443", "https://x.test")).toBe(false);
    expect(upgradeOriginOk("", "https://x.test")).toBe(false);
  });
});

describe("stripUpgradeOp", () => {
  it("deletes every X-Pendant-* header", () => {
    const headers = new Headers({
      "X-Pendant-Op": "avatar",
      "X-Pendant-Role": "phone",
      "X-Pendant-Sub": "attacker",
      "X-Pendant-Email": "ada@example.com",
      Cookie: "pendant_session=x",
    });
    stripUpgradeOp(headers);
    expect(headers.get("X-Pendant-Op")).toBeNull();
    expect(headers.get("X-Pendant-Role")).toBeNull();
    expect(headers.get("X-Pendant-Sub")).toBeNull();
    expect(headers.get("X-Pendant-Email")).toBeNull();
    expect(headers.get("Cookie")).toBe("pendant_session=x");
  });
});

describe("stampMailboxHeaders", () => {
  it("does not keep a client-supplied Sub on a crane upgrade", () => {
    const request = new Request("https://x.test/ws/kit?role=crane", {
      headers: {
        "X-Pendant-Sub": "attacker-picked",
        "X-Pendant-Email": "ada@example.com",
        "X-Pendant-EmailVerified": "1",
        "X-Pendant-Exp": "1",
        "X-Pendant-Op": "avatar",
        Authorization: "Bearer crane-tok",
      },
    });
    const headers = stampMailboxHeaders(request, {
      role: "crane",
      rateId: "bearer:kit",
      slug: "kit",
    });
    expect(headers.get("X-Pendant-Op")).toBeNull();
    expect(headers.get("X-Pendant-Sub")).toBeNull();
    expect(headers.get("X-Pendant-Email")).toBeNull();
    expect(headers.get("X-Pendant-EmailVerified")).toBeNull();
    expect(headers.get("X-Pendant-Exp")).toBeNull();
    expect(headers.get("X-Pendant-Role")).toBe("crane");
    expect(headers.get("X-Pendant-Rate")).toBe("bearer:kit");
    expect(headers.get("X-Pendant-Slug")).toBe("kit");
    expect(headers.get("Authorization")).toBeNull();
  });

  it("stamps phone Sub after stripping the client copy", () => {
    const request = new Request("https://x.test/ws/kit?role=phone", {
      headers: { "X-Pendant-Sub": "attacker-picked" },
    });
    const headers = stampMailboxHeaders(request, {
      role: "phone",
      rateId: "sub:1182",
      slug: "kit",
      userId: "1182",
      email: "ada@x.com",
      emailVerified: true,
      exp: 9,
    });
    expect(headers.get("X-Pendant-Sub")).toBe("1182");
    expect(headers.get("X-Pendant-Email")).toBe("ada@x.com");
    expect(headers.get("X-Pendant-EmailVerified")).toBe("1");
    expect(headers.get("X-Pendant-Exp")).toBe("9");
  });
});
