import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";

import type { BoundingBox, TextRegionRead } from "../types/api";

interface DragState {
  regionId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startBox: BoundingBox;
  box: BoundingBox;
}

export function CanvasWorkspace({
  imageUrl,
  width = 920,
  height = 1320,
  regions,
  selectedRegionId,
  onSelectRegion,
  onMoveRegion,
  mode,
}: {
  imageUrl?: string;
  width?: number | null;
  height?: number | null;
  regions: TextRegionRead[];
  selectedRegionId?: string;
  onSelectRegion: (regionId: string) => void;
  onMoveRegion?: (regionId: string, boundingBox: BoundingBox) => void;
  mode: "original" | "translated";
}) {
  const canvasWidth = width ?? 920;
  const canvasHeight = height ?? 1320;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState<DragState | null>(null);
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

  function clampBox(box: BoundingBox): BoundingBox {
    return {
      x: Math.max(0, Math.min(Math.round(box.x), Math.max(canvasWidth - box.width, 0))),
      y: Math.max(0, Math.min(Math.round(box.y), Math.max(canvasHeight - box.height, 0))),
      width: Math.max(1, Math.round(box.width)),
      height: Math.max(1, Math.round(box.height)),
    };
  }

  function boxForPointer(event: PointerEvent, state: DragState): BoundingBox {
    if (!displaySize) {
      return state.box;
    }
    const deltaX = ((event.clientX - state.startClientX) / displaySize.width) * canvasWidth;
    const deltaY = ((event.clientY - state.startClientY) / displaySize.height) * canvasHeight;
    return clampBox({
      ...state.startBox,
      x: state.startBox.x + deltaX,
      y: state.startBox.y + deltaY,
    });
  }

  function startDrag(event: PointerEvent<HTMLDivElement>, region: TextRegionRead) {
    if (!displaySize || !onMoveRegion) {
      onSelectRegion(region.id);
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelectRegion(region.id);
    setDrag({
      regionId: region.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBox: region.bounding_box,
      box: region.bounding_box,
    });
  }

  function updateDrag(event: PointerEvent<HTMLDivElement>) {
    setDrag((current) => {
      if (!current || current.pointerId !== event.pointerId) {
        return current;
      }
      return { ...current, box: boxForPointer(event, current) };
    });
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
    const moved = drag.box.x !== drag.startBox.x || drag.box.y !== drag.startBox.y;
    if (moved) {
      onMoveRegion?.(drag.regionId, drag.box);
    }
    setDrag(null);
  }

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
          const boundingBox = drag?.regionId === region.id ? drag.box : region.bounding_box;
          const left = (boundingBox.x / canvasWidth) * 100;
          const top = (boundingBox.y / canvasHeight) * 100;
          const boxWidth = (boundingBox.width / canvasWidth) * 100;
          const boxHeight = (boundingBox.height / canvasHeight) * 100;
          return (
            <div
              key={region.id}
              role="button"
              tabIndex={0}
              title={`Region ${region.region_index}`}
              onPointerDown={(event) => startDrag(event, region)}
              onPointerMove={updateDrag}
              onPointerUp={finishDrag}
              onPointerCancel={() => setDrag(null)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectRegion(region.id);
                }
              }}
              className={`absolute cursor-move select-none rounded-[3px] text-left transition ${
                active ? "border-2 border-secondary bg-secondary/12 shadow-cyan" : "border-2 border-dashed border-secondary/80 bg-secondary/5 hover:bg-secondary/10"
              }`}
              style={{ left: `${left}%`, top: `${top}%`, width: `${boxWidth}%`, height: `${boxHeight}%` }}
            >
              {mode === "translated" ? (
                <span className="flex h-full w-full items-center justify-center overflow-hidden break-words px-1 text-center font-comic text-[clamp(7px,0.85vw,14px)] font-bold leading-[1.05] text-slate-950">
                  {region.user_text || region.translated_text || ""}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
