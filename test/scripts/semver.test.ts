import { describe, expect, it } from "vitest";
// @ts-expect-error scripts/*.mjs sits outside the TS project
import { nextVersion, parseArgs, versionWithoutV } from "../../scripts/semver.mjs";

describe("nextVersion", () => {
  it("bumps from empty / existing tags", () => {
    expect(nextVersion("", "patch", "")).toBe("v0.0.1");
    expect(nextVersion("v0.1.0", "patch", "")).toBe("v0.1.1");
    expect(nextVersion("v0.1.0", "minor", "")).toBe("v0.2.0");
    expect(nextVersion("v0.1.0", "major", "")).toBe("v1.0.0");
    expect(nextVersion("v1.2.3", "patch", "")).toBe("v1.2.4");
    expect(nextVersion("v0.1.0", "patch", "v9.8.7")).toBe("v9.8.7");
    expect(nextVersion("v0.1.0", "patch", "1.0.0")).toBe("v1.0.0");
  });

  it("rejects junk", () => {
    expect(() => nextVersion("v0.1.0", "tiny", "")).toThrow(/bump/);
    expect(() => nextVersion("v0.1.0", "patch", "nope")).toThrow(/version/);
  });
});

describe("parseArgs", () => {
  it("reads flags", () => {
    expect(parseArgs(["--bump=minor", "--dry-run"])).toMatchObject({ bump: "minor", dryRun: true });
  });
});

describe("versionWithoutV", () => {
  it("strips the v", () => {
    expect(versionWithoutV("v0.1.1")).toBe("0.1.1");
  });
});
