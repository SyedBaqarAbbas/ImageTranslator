import type { TextRegionRead } from "../types/api";

export function CanvasWorkspace({
  imageUrl,
  width = 920,
  height = 1320,
  regions,
  selectedRegionId,
  onSelectRegion,
  mode,
}: {
  imageUrl?: string;
  width?: number | null;
  height?: number | null;
  regions: TextRegionRead[];
  selectedRegionId?: string;
  onSelectRegion: (regionId: string) => void;
  mode: "original" | "translated";
}) {
  const canvasWidth = width ?? 920;
  const canvasHeight = height ?? 1320;

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-background p-4 md:p-8">
      <div className="relative max-h-full w-full max-w-[760px]" style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}>
        {imageUrl ? (
          <img className="h-full w-full rounded-instrument border border-ink-border object-contain shadow-2xl" src={imageUrl} alt="Selected comic page" />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-instrument border border-ink-border bg-surface-low text-text-muted">
            No page preview available
          </div>
        )}

        {regions.map((region) => {
          const active = region.id === selectedRegionId;
          const left = (region.bounding_box.x / canvasWidth) * 100;
          const top = (region.bounding_box.y / canvasHeight) * 100;
          const boxWidth = (region.bounding_box.width / canvasWidth) * 100;
          const boxHeight = (region.bounding_box.height / canvasHeight) * 100;
          return (
            <button
              key={region.id}
              type="button"
              onClick={() => onSelectRegion(region.id)}
              title={`Region ${region.region_index}`}
              className={`absolute rounded-[3px] text-left transition ${
                active ? "border-2 border-secondary bg-secondary/12 shadow-cyan" : "border-2 border-dashed border-secondary/80 bg-secondary/5 hover:bg-secondary/10"
              }`}
              style={{ left: `${left}%`, top: `${top}%`, width: `${boxWidth}%`, height: `${boxHeight}%` }}
            >
              {mode === "translated" ? (
                <span className="flex h-full w-full items-center justify-center px-2 text-center font-comic text-[clamp(10px,1.2vw,18px)] font-bold leading-tight text-slate-950">
                  {region.user_text || region.translated_text || ""}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
