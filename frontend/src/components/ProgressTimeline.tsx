import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";

interface Stage {
  label: string;
  detail: string;
  threshold: number;
}

const stages: Stage[] = [
  { label: "Uploading images", detail: "Raw files are secured in the workspace.", threshold: 5 },
  { label: "Detecting text", detail: "OCR maps speech bubbles and SFX zones.", threshold: 28 },
  { label: "Translating regions", detail: "Contextual translation and tone pass.", threshold: 68 },
  { label: "Rendering previews", detail: "Typography and page previews are prepared.", threshold: 92 },
  { label: "Ready for review", detail: "Low-confidence regions are flagged.", threshold: 100 },
];

export function ProgressTimeline({ progress, failed = false }: { progress: number; failed?: boolean }) {
  return (
    <div className="space-y-4">
      {stages.map((stage) => {
        const complete = progress >= stage.threshold;
        const active = !failed && progress < stage.threshold && progress >= Math.max(0, stage.threshold - 35);
        return (
          <div key={stage.label} className="flex gap-4">
            <div className="pt-1">
              {failed && active ? (
                <XCircle className="h-5 w-5 text-danger" />
              ) : complete ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              ) : active ? (
                <Loader2 className="h-5 w-5 animate-spin text-secondary" />
              ) : (
                <Circle className="h-5 w-5 text-ink-border-strong" />
              )}
            </div>
            <div>
              <p className={`font-display text-base font-semibold ${complete || active ? "text-white" : "text-text-muted"}`}>{stage.label}</p>
              <p className="text-sm text-text-muted">{stage.detail}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
