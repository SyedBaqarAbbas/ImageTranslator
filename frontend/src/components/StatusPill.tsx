import { statusLabel, statusTone } from "../lib/routing";

const toneClass = {
  accent: "border-accent/35 bg-accent/10 text-accent",
  active: "border-accent/35 bg-accent/10 text-accent",
  warning: "border-warning/40 bg-warning/10 text-warning",
  danger: "border-danger/40 bg-danger/10 text-danger",
  success: "border-success/40 bg-success/10 text-success-content",
  neutral: "border-border-strong bg-surface-high text-content-muted",
};

export function StatusPill({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <span className={`inline-flex items-center rounded-instrument border px-2.5 py-1 text-xs font-semibold ${toneClass[tone]}`}>
      {statusLabel(status)}
    </span>
  );
}
