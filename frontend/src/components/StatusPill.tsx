import { statusLabel, statusTone } from "../lib/routing";

const toneClass = {
  violet: "border-primary/30 bg-primary/15 text-primary-soft",
  cyan: "border-secondary/30 bg-secondary/10 text-secondary",
  amber: "border-tertiary/35 bg-tertiary/10 text-tertiary",
  red: "border-danger/40 bg-danger/10 text-danger",
  green: "border-emerald-400/35 bg-emerald-400/10 text-emerald-300",
  slate: "border-ink-border-strong bg-surface-high text-text-muted",
};

export function StatusPill({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <span className={`inline-flex items-center rounded-instrument border px-2.5 py-1 text-xs font-semibold ${toneClass[tone]}`}>
      {statusLabel(status)}
    </span>
  );
}
