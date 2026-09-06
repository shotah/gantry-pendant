import { afterEach, describe, expect, it } from "vitest";
import {
  AUTH_RATE_PER_MIN,
  clientIp,
  limitAuthIp,
  limitAuthRequest,
  resetAuthLimits,
  takeAuthAttempt,
} from "@/lib/auth/limit";

afterEach(() => {
  resetAuthLimits();
});

describe("auth rate limit", () => {
  it("reads CF-Connecting-IP then X-Forwarded-For", () => {
    expect(clientIp(new Request("https://x.test", { headers: { "CF-Connecting-IP": "1.1.1.1" } }))).toBe("1.1.1.1");
    expect(clientIp(new Request("https://x.test", { headers: { "X-Forwarded-For": "2.2.2.2, 3.3.3.3" } }))).toBe("2.2.2.2");
    expect(clientIp(new Request("https://x.test"))).toBe("unknown");
  });

  it("returns the same miss after the burst", () => {
    const now = 1_000;
    for (let i = 0; i < AUTH_RATE_PER_MIN; i += 1) {
      expect(takeAuthAttempt("ip:1.1.1.1", now)).toBe(true);
    }
    expect(takeAuthAttempt("ip:1.1.1.1", now)).toBe(false);
    expect(limitAuthIp(new Request("https://x.test", { headers: { "CF-Connecting-IP": "1.1.1.1" } }), now)).toBe(false);
  });

  it("limits per IP and per sub independently", () => {
    const now = 1_000;
    const req = new Request("https://x.test", { headers: { "CF-Connecting-IP": "9.9.9.9" } });
    expect(limitAuthRequest(req, "1182", now)).toBe(true);
    for (let i = 1; i < AUTH_RATE_PER_MIN; i += 1) {
      expect(limitAuthRequest(req, "1182", now)).toBe(true);
    }
    expect(limitAuthRequest(req, "1182", now)).toBe(false);
  });
});
