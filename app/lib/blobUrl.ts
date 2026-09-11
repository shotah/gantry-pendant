import { useEffect, useState } from "react";

/**
 * Same-origin fetch → object URL, revoked when `path` changes or on unmount.
 * Null `path`, a non-2xx, or a thrown fetch all land on `fallback`.
 */
export function useBlobUrl(path: string | null, fallback = ""): string {
  const [src, setSrc] = useState(fallback);

  useEffect(() => {
    if (!path) {
      setSrc(fallback);
      return;
    }
    let dead = false;
    let obj = "";
    void (async () => {
      try {
        const res = await fetch(path, { credentials: "include" });
        if (!res.ok) {
          if (!dead) {
            setSrc(fallback);
          }
          return;
        }
        const blob = await res.blob();
        obj = URL.createObjectURL(blob);
        if (!dead) {
          setSrc(obj);
        } else {
          URL.revokeObjectURL(obj);
        }
      } catch {
        if (!dead) {
          setSrc(fallback);
        }
      }
    })();
    return () => {
      dead = true;
      if (obj) {
        URL.revokeObjectURL(obj);
      }
    };
  }, [path, fallback]);

  return src;
}
