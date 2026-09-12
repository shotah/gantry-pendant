import { describe, expect, it } from "vitest";
import * as logout from "@/app/api/auth/logout/route";
import { SESSION_COOKIE } from "@/lib/auth/session";

describe("logout route", () => {
  it("clears the session cookie on POST and has no GET", async () => {
    expect("GET" in logout).toBe(false);
    const res = logout.POST(new Request("https://pendant.example/api/auth/logout", { method: "POST" }));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE}=;`) && c.includes("Max-Age=0"))).toBe(true);
  });
});
