"use client";

import { useEffect, useRef, useState } from "react";
import { uploadAvatarFile } from "@/app/lib/avatar";
import { avatarRequestPath } from "@/lib/avatar/http";
import { displaySlug } from "@/lib/avatar/store";

const FALLBACK = "/icon.svg";

const DIM = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-16 w-16",
} as const;

export function KitAvatar({
  slug,
  rev,
  secret,
  bearer,
  size = "md",
  editable,
  onRev,
  onError,
}: {
  slug: string;
  rev: number;
  secret?: string;
  bearer?: string;
  size?: keyof typeof DIM;
  editable?: boolean;
  onRev?: (rev: number) => void;
  onError?: (msg: string) => void;
}) {
  const [src, setSrc] = useState(FALLBACK);
  const fileRef = useRef<HTMLInputElement>(null);
  const dim = DIM[size];
  const name = displaySlug(slug);

  useEffect(() => {
    if (!slug) {
      setSrc(FALLBACK);
      return;
    }
    let dead = false;
    let obj = "";
    const path = avatarRequestPath({ slug, rev, secret, bearer });
    void (async () => {
      try {
        const res = await fetch(path, { credentials: "include" });
        if (!res.ok) {
          if (!dead) {
            setSrc(FALLBACK);
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
          setSrc(FALLBACK);
        }
      }
    })();
    return () => {
      dead = true;
      if (obj) {
        URL.revokeObjectURL(obj);
      }
    };
  }, [slug, rev, secret, bearer]);

  const img = (
    <img src={src} alt="" className={`${dim} shrink-0 rounded-full object-cover bg-track`} />
  );

  if (!editable) {
    return img;
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) {
            return;
          }
          void (async () => {
            const got = await uploadAvatarFile({ slug, file: f, secret, bearer });
            if (got.ok) {
              onRev?.(got.rev);
              onError?.("");
              return;
            }
            onError?.(got.error);
          })();
        }}
      />
      <button
        type="button"
        className="shrink-0 rounded-full"
        aria-label={`Change ${name}'s photo`}
        title={`Change ${name}'s photo`}
        onClick={() => fileRef.current?.click()}
      >
        {img}
      </button>
    </>
  );
}
