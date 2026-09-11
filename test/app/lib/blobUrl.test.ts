/** @vitest-environment jsdom */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBlobUrl } from "@/app/lib/blobUrl";

const create = vi.fn<(b: Blob) => string>();
const revoke = vi.fn<(u: string) => void>();

beforeEach(() => {
  let n = 0;
  create.mockReset().mockImplementation(() => `blob:${++n}`);
  revoke.mockReset();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: create });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});

function stubFetch(status: number) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo) => {
    calls.push(String(input));
    // Bytes, not a jsdom Blob: Node's Response cannot stream jsdom's Blob.
    return status === 200
      ? new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status, headers: { "Content-Type": "image/jpeg" } })
      : new Response(null, { status });
  });
  return calls;
}

describe("useBlobUrl", () => {
  it("stays on the fallback with no path and never fetches", async () => {
    const calls = stubFetch(200);
    const { result } = renderHook(() => useBlobUrl(null, "/icon.svg"));
    expect(result.current).toBe("/icon.svg");
    await Promise.resolve();
    expect(calls).toEqual([]);
  });

  it("turns a 200 into an object URL and revokes it on unmount", async () => {
    const calls = stubFetch(200);
    const { result, unmount } = renderHook(() => useBlobUrl("/api/backdrop?slug=kit&v=7"));
    await waitFor(() => expect(result.current).toBe("blob:1"));
    expect(calls).toEqual(["/api/backdrop?slug=kit&v=7"]);
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:1");
  });

  it("falls back on a 404 and refetches when the path changes", async () => {
    const calls = stubFetch(404);
    const { result, rerender } = renderHook(({ path }: { path: string | null }) => useBlobUrl(path, "/icon.svg"), {
      initialProps: { path: "/api/backdrop?slug=kit" },
    });
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(result.current).toBe("/icon.svg");
    rerender({ path: "/api/backdrop?slug=kit&v=9" });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toBe("/api/backdrop?slug=kit&v=9");
  });

  it("falls back when fetch throws", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    const { result } = renderHook(() => useBlobUrl("/api/avatar?slug=kit", "/icon.svg"));
    await waitFor(() => expect(result.current).toBe("/icon.svg"));
  });
});
