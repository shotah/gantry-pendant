import { describe, expect, it } from "vitest";
import { stripUpgradeOp, upgradeOriginOk } from "@/lib/auth/upgrade";

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
  it("deletes X-Pendant-Op so /ws/ cannot reach avatarHttp", () => {
    const headers = new Headers({
      "X-Pendant-Op": "avatar",
      "X-Pendant-Role": "phone",
    });
    stripUpgradeOp(headers);
    expect(headers.get("X-Pendant-Op")).toBeNull();
    expect(headers.get("X-Pendant-Role")).toBe("phone");
  });
});
