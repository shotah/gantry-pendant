import { CONFIG_GAP_COPY, type ConfigGap } from "@/lib/auth/mode";

export function ConfigGapNote({ gap }: { gap: ConfigGap }) {
  const copy = CONFIG_GAP_COPY[gap];
  return (
    <div className="flex max-w-sm flex-col items-center gap-3 text-center">
      <p className="text-sm text-body">{copy.heading}</p>
      <p className="text-sm text-muted">{copy.detail}</p>
    </div>
  );
}
