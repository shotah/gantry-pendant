import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { chromeInstallIssues, PENDANT_MANIFEST, type WebAppManifest } from "@/app/lib/pwa";

describe("pwa", () => {
  it("meets Chrome's installable-manifest rules", () => {
    expect(chromeInstallIssues(PENDANT_MANIFEST)).toEqual([]);
    expect(manifest()).toBe(PENDANT_MANIFEST);
    expect(PENDANT_MANIFEST.display).toBe("standalone");
    expect(PENDANT_MANIFEST.start_url).toBe("/");
    expect(PENDANT_MANIFEST.icons.some((i) => i.src === "/icon.svg")).toBe(true);
    expect(PENDANT_MANIFEST.shortcuts.map((s) => s.url)).toEqual(["/#compose", "/?pin=1"]);
  });

  it("names the gaps Chromium cares about", () => {
    const empty: WebAppManifest = {};
    expect(chromeInstallIssues(empty)).toEqual([
      "need name or short_name",
      "need start_url",
      "display must be standalone, fullscreen, minimal-ui, or window-controls-overlay",
      "need a 192x192 PNG icon",
      "need a 512x512 PNG icon",
    ]);
    expect(chromeInstallIssues({
      ...PENDANT_MANIFEST,
      display: "browser",
      prefer_related_applications: true,
      icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
    })).toEqual([
      "display must be standalone, fullscreen, minimal-ui, or window-controls-overlay",
      "prefer_related_applications must be false or omitted",
      "need a 192x192 PNG icon",
      "need a 512x512 PNG icon",
    ]);
  });
});
