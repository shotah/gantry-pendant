import { describe, expect, it } from "vitest";
// @ts-expect-error scripts/*.mjs sits outside the TS project
import { collectSecrets, joinBearers, parseBearers, parseCli, parseEnv } from "../../scripts/push-secrets.mjs";

describe("parseEnv", () => {
  it("reads keys, quotes, export, and skips comments", () => {
    const env = parseEnv(`
# comment
GOOGLE_CLIENT_ID=abc
export SESSION_SECRET="s e c"
CRANE_BEARER_kit='tok'
MAILBOX_SECRET=
`);
    expect(env.GOOGLE_CLIENT_ID).toBe("abc");
    expect(env.SESSION_SECRET).toBe("s e c");
    expect(env.CRANE_BEARER_kit).toBe("tok");
    expect(env.MAILBOX_SECRET).toBe("");
  });
});

describe("bearers", () => {
  it("joins a map as sorted slug:token", () => {
    const map = parseBearers("kit:alpha,ada:beta");
    expect(joinBearers(map)).toBe("ada:beta,kit:alpha");
  });
});

describe("collectSecrets", () => {
  it("folds CRANE_BEARER_* into CRANE_BEARERS and skips loopback keys", () => {
    const { secrets, skipped } = collectSecrets({
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "sec",
      SESSION_SECRET: "sess",
      CRANE_BEARER_kit: "kit-tok",
      CRANE_BEARER_ada: "ada-tok",
      MAILBOX_SECRET: "spike",
      PENDANT_DEV: "1",
      CLOUDFLARE_API_TOKEN: "nope",
      DIRECTORY_KV_ID: "a".repeat(32),
    });
    expect(secrets).toEqual({
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "sec",
      SESSION_SECRET: "sess",
      CRANE_BEARERS: "ada:ada-tok,kit:kit-tok",
    });
    expect(secrets).not.toHaveProperty("CRANE_BEARER_kit");
    expect(skipped).toEqual(
      expect.arrayContaining(["MAILBOX_SECRET", "PENDANT_DEV", "CLOUDFLARE_API_TOKEN", "DIRECTORY_KV_ID"]),
    );
  });

  it("overlays CRANE_BEARER_* onto an existing CRANE_BEARERS line", () => {
    const { secrets } = collectSecrets({
      CRANE_BEARERS: "kit:old,ada:keep",
      CRANE_BEARER_kit: "new",
    });
    expect(secrets.CRANE_BEARERS).toBe("ada:keep,kit:new");
  });

  it("omits empty allowlist keys", () => {
    const { secrets } = collectSecrets({
      GOOGLE_CLIENT_ID: "id",
      SESSION_SECRET: "",
      ALLOWED_SUBS: "",
      CRANE_BEARER_kit: "",
    });
    expect(secrets).toEqual({ GOOGLE_CLIENT_ID: "id" });
  });
});

describe("parseCli", () => {
  it("defaults to .env", () => {
    expect(parseCli([])).toEqual({ dryRun: false, file: ".env", help: false });
    expect(parseCli(["--dry-run", "--file=.env.prod"]).dryRun).toBe(true);
    expect(parseCli(["--file=.env.prod"]).file).toBe(".env.prod");
  });

  it("rejects unknown flags", () => {
    expect(() => parseCli(["--push"])).toThrow(/unknown arg/);
  });
});
