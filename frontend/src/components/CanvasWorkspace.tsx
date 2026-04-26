import { useEffect, useMemo, useRef, useState } from "react";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const displaySize = useMemo(() => {
    const aspect = canvasWidth / canvasHeight;
    const maxWidth = 760;
    const availableWidth = Math.max(containerSize.width, 0);
    const availableHeight = Math.max(containerSize.height, 0);
    if (!availableWidth || !availableHeight) {
      return null;
    }

    let displayWidth = Math.min(availableWidth, maxWidth, availableHeight * aspect);
    let displayHeight = displayWidth / aspect;

    if (displayHeight > availableHeight) {
      displayHeight = availableHeight;
      displayWidth = displayHeight * aspect;
    }

    return {
      width: Math.max(displayWidth, 1),
      height: Math.max(displayHeight, 1),
    };
  }, [canvasHeight, canvasWidth, containerSize.height, containerSize.width]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      setContainerSize({
        width: Math.max(rect.width - horizontalPadding, 0),
        height: Math.max(rect.height - verticalPadding, 0),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="flex min-h-[240px] flex-1 items-center justify-center overflow-auto bg-background p-3 md:p-4 lg:min-h-0 lg:p-8">
      <div
        className="relative shrink-0"
        style={{
          aspectRatio: `${canvasWidth} / ${canvasHeight}`,
          width: displaySize?.width ?? "100%",
          height: displaySize?.height ?? "auto",
          maxWidth: "100%",
          maxHeight: "100%",
        }}
      >
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
                <span className="flex h-full w-full items-center justify-center overflow-hidden break-words px-1 text-center font-comic text-[clamp(7px,0.85vw,14px)] font-bold leading-[1.05] text-slate-950">
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
