import { describe, expect, it } from "vitest";
import { AUTH_DENIED_LOCATION, AUTH_RETRY_LOCATION, authDeniedFromQuery, authRetryFromQuery } from "@/lib/auth/bounce";

describe("auth bounce", () => {
  it("lands on the door with a retry flag the shell can read", () => {
    const url = new URL(AUTH_RETRY_LOCATION, "https://pendant.example");
    expect(url.pathname).toBe("/");
    expect(authRetryFromQuery(url.searchParams)).toBe(true);
  });

  it("ignores other or missing auth flags", () => {
    expect(authRetryFromQuery(new URLSearchParams(""))).toBe(false);
    expect(authRetryFromQuery(new URLSearchParams("auth=ok"))).toBe(false);
    expect(authRetryFromQuery(new URLSearchParams("retry=1"))).toBe(false);
  });

  it("tells retry and denied apart", () => {
    const denied = new URL(AUTH_DENIED_LOCATION, "https://pendant.example");
    expect(denied.pathname).toBe("/");
    expect(authDeniedFromQuery(denied.searchParams)).toBe(true);
    expect(authRetryFromQuery(denied.searchParams)).toBe(false);
    expect(authDeniedFromQuery(new URL(AUTH_RETRY_LOCATION, "https://pendant.example").searchParams)).toBe(false);
    expect(authDeniedFromQuery(new URLSearchParams(""))).toBe(false);
  });
});
