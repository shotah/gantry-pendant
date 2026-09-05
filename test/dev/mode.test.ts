import { describe, expect, it } from "vitest";
import { devEnabled, envFlag, hostFromRequest, loopbackHost } from "@/lib/dev/mode";

describe("dev mode", () => {
  it("treats 1/true/yes/on as on", () => {
    expect(envFlag("1")).toBe(true);
    expect(envFlag("TRUE")).toBe(true);
    expect(envFlag("yes")).toBe(true);
    expect(envFlag("on")).toBe(true);
    expect(envFlag("0")).toBe(false);
    expect(envFlag("")).toBe(false);
    expect(envFlag(undefined)).toBe(false);
  });

  it("only loopback hosts count", () => {
    expect(loopbackHost("127.0.0.1")).toBe(true);
    expect(loopbackHost("localhost")).toBe(true);
    expect(loopbackHost("LOCALHOST")).toBe(true);
    expect(loopbackHost("[::1]")).toBe(true);
    expect(loopbackHost("::1")).toBe(true);
    expect(loopbackHost("gantry-pendant.example.workers.dev")).toBe(false);
    expect(loopbackHost("127.0.0.1.attacker.test")).toBe(false);
  });

  it("requires the flag and loopback together", () => {
    expect(devEnabled({ PENDANT_DEV: "1" }, "127.0.0.1")).toBe(true);
    expect(devEnabled({ PENDANT_DEV: "1" }, "workers.dev")).toBe(false);
    expect(devEnabled({}, "127.0.0.1")).toBe(false);
  });

  it("reads hostname from the request URL", () => {
    expect(hostFromRequest(new Request("http://127.0.0.1:5173/api/auth/me"))).toBe("127.0.0.1");
    expect(hostFromRequest(new Request("http://localhost:5173/"))).toBe("localhost");
  });
});
