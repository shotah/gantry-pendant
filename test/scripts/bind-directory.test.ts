import { describe, expect, it } from "vitest";
// @ts-expect-error scripts/*.mjs sits outside the TS project
import { applyDirectoryId, assertDeployableDirectoryId, directoryIdOf } from "../../scripts/bind-directory.mjs";

const SAMPLE = `{
  "kv_namespaces": [
    {
      "binding": "DIRECTORY",
      // comment
      "id": "directory-local",
      "preview_id": "directory-local"
    }
  ]
}
`;

describe("directoryIdOf", () => {
  it("reads the DIRECTORY binding id", () => {
    expect(directoryIdOf(SAMPLE)).toBe("directory-local");
  });

  it("returns empty when missing", () => {
    expect(directoryIdOf(`{ "name": "gantry-pendant" }`)).toBe("");
  });
});

describe("applyDirectoryId", () => {
  it("replaces only the DIRECTORY id", () => {
    const id = "a".repeat(32);
    const next = applyDirectoryId(SAMPLE, id);
    expect(directoryIdOf(next)).toBe(id);
    expect(next).toContain(`"preview_id": "directory-local"`);
  });

  it("throws when there is no binding", () => {
    expect(() => applyDirectoryId("{}", "a".repeat(32))).toThrow(/DIRECTORY/);
  });
});

describe("assertDeployableDirectoryId", () => {
  it("rejects the placeholder and junk", () => {
    expect(() => assertDeployableDirectoryId("directory-local")).toThrow(/placeholder/);
    expect(() => assertDeployableDirectoryId("")).toThrow(/placeholder/);
    expect(() => assertDeployableDirectoryId("not-an-id")).toThrow(/looks wrong/);
  });

  it("accepts a 32-char hex id", () => {
    const id = "0123456789abcdef0123456789abcdef";
    expect(assertDeployableDirectoryId(id)).toBe(id);
  });
});
