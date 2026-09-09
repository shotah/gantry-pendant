"use client";

import { useEffect, useState } from "react";
import { ThemeSelect } from "../shared/ThemeSelect";
import { ConfigGapNote } from "./ConfigGapNote";
import type { ConfigGap } from "@/lib/auth/mode";

type AuthCfg = {
  mode: "spike" | "oidc" | null;
  google: boolean;
  gap?: ConfigGap | null;
};

export function LoginDoor() {
  const [cfg, setCfg] = useState<AuthCfg | null>(null);

  useEffect(() => {
    void fetch("/api/auth/config")
      .then((r) => r.json() as Promise<AuthCfg>)
      .then(setCfg)
      .catch(() => setCfg({ mode: null, google: false, gap: null }));
  }, []);

  const gap = cfg?.gap ?? null;

  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-6"
      data-shot="login"
    >
      <div className="absolute right-4 top-4">
        <ThemeSelect />
      </div>
      <img src="/icon.svg" alt="" className="h-16 w-16" />
      <h1 className="text-xl font-medium text-fg">Pendant</h1>
      {gap
        ? <ConfigGapNote gap={gap} />
        : (
            <>
              <p className="max-w-sm text-center text-sm text-muted">
                Sign in with Google. The crane decides who may talk.
              </p>
              {cfg
                ? (
                    <a
                      className="rounded-xl border border-accent-line bg-accent-soft px-4 py-2 text-sm text-mark"
                      href="/api/auth/google"
                    >
                      Continue with Google
                    </a>
                  )
                : null}
            </>
          )}
    </main>
  );
}
