import { describe, expect, it } from "vitest";
import {
  googleCallbackLocation,
  googleReturnTo,
  googleStartHref,
  parseGoogleNext,
} from "@/lib/auth/returnTo";

describe("google return-to", () => {
  it("only keeps / or /?slug=<slug>", () => {
    expect(parseGoogleNext(null)).toBe("/");
    expect(parseGoogleNext("/")).toBe("/");
    expect(parseGoogleNext("/?slug=kit")).toBe("/?slug=kit");
    expect(parseGoogleNext("/?slug=Kit")).toBe("/?slug=kit");
    expect(parseGoogleNext("https://evil.example/")).toBe("/");
    expect(parseGoogleNext("//evil.example")).toBe("/");
    expect(parseGoogleNext("/\\evil")).toBe("/");
    expect(parseGoogleNext("/?slug=nope!")).toBe("/");
    expect(parseGoogleNext("/login")).toBe("/");
    expect(parseGoogleNext("/?slug=kit&next=https://x")).toBe("/");
    expect(googleReturnTo("kit")).toBe("/?slug=kit");
    expect(googleReturnTo("nope!")).toBe("/");
    expect(googleReturnTo(null)).toBe("/");
  });

  it("builds the Google start href and sanitizes the callback land", () => {
    expect(googleStartHref(null)).toBe("/api/auth/google");
    expect(googleStartHref("kit")).toBe("/api/auth/google?next=%2F%3Fslug%3Dkit");
    expect(googleCallbackLocation("/?slug=kit")).toBe("/?slug=kit");
    expect(googleCallbackLocation("https://evil.example")).toBe("/");
  });
});
