"use client";

import { useRef } from "react";
import { uploadAvatarFile } from "@/app/lib/avatar";
import { useBlobUrl } from "@/app/lib/blobUrl";
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
  const src = useBlobUrl(slug ? avatarRequestPath({ slug, rev, secret, bearer }) : null, FALLBACK);
  const fileRef = useRef<HTMLInputElement>(null);
  const dim = DIM[size];
  const name = displaySlug(slug);

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
