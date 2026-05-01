import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { PointerEvent } from "react";

import type { BoundingBox, TextRegionRead } from "../types/api";

interface DragState {
  regionId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startBox: BoundingBox;
  box: BoundingBox;
  kind: "move" | "resize";
  handle?: ResizeHandle;
}

interface DisplaySize {
  width: number;
  height: number;
}

type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

const RESIZE_HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const MIN_REGION_SIZE = 24;
const BASE_FIT_WIDTH = 760;
const DEFAULT_TEXT_COLOR = "#0f172a";
const DEFAULT_FILL_COLOR = "#ffffff";

const handleClassName: Record<ResizeHandle, string> = {
  n: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
  ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
  e: "right-0 top-1/2 -translate-y-1/2 translate-x-1/2 cursor-ew-resize",
  se: "bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  s: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
  sw: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
  w: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
  nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
};

function renderStyleValue(region: TextRegionRead, keys: string[], fallback?: string): string | undefined {
  const style = region.render_style;
  if (!style) {
    return fallback;
  }
  for (const key of keys) {
    const value = style[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return fallback;
}

function renderStyleNumber(region: TextRegionRead, key: string): number | null {
  const value = region.render_style?.[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function translucentColor(value: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return `${value}44`;
  }
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    const expanded = `#${value
      .slice(1)
      .split("")
      .map((character) => `${character}${character}`)
      .join("")}`;
    return `${expanded}44`;
  }
  return value;
}

function containerSizeReducer(_current: DisplaySize, next: DisplaySize): DisplaySize {
  return next;
}

function clampBox(box: BoundingBox, canvasWidth: number, canvasHeight: number): BoundingBox {
  const width = Math.max(MIN_REGION_SIZE, Math.min(Math.round(box.width), canvasWidth));
  const height = Math.max(MIN_REGION_SIZE, Math.min(Math.round(box.height), canvasHeight));
  return {
    x: Math.max(0, Math.min(Math.round(box.x), Math.max(canvasWidth - width, 0))),
    y: Math.max(0, Math.min(Math.round(box.y), Math.max(canvasHeight - height, 0))),
    width,
    height,
  };
}

function resizeBoxForPointer(
  startBox: BoundingBox,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  canvasWidth: number,
  canvasHeight: number,
): BoundingBox {
  let x = startBox.x;
  let y = startBox.y;
  let width = startBox.width;
  let height = startBox.height;

  if (handle.includes("e")) {
    width = startBox.width + deltaX;
  }
  if (handle.includes("s")) {
    height = startBox.height + deltaY;
  }
  if (handle.includes("w")) {
    x = startBox.x + deltaX;
    width = startBox.width - deltaX;
    if (width < MIN_REGION_SIZE) {
      x = startBox.x + startBox.width - MIN_REGION_SIZE;
      width = MIN_REGION_SIZE;
    }
  }
  if (handle.includes("n")) {
    y = startBox.y + deltaY;
    height = startBox.height - deltaY;
    if (height < MIN_REGION_SIZE) {
      y = startBox.y + startBox.height - MIN_REGION_SIZE;
      height = MIN_REGION_SIZE;
    }
  }
  if (x < 0) {
    width += x;
    x = 0;
  }
  if (y < 0) {
    height += y;
    y = 0;
  }
  if (x + width > canvasWidth) {
    width = canvasWidth - x;
  }
  if (y + height > canvasHeight) {
    height = canvasHeight - y;
  }

  return clampBox({ x, y, width, height }, canvasWidth, canvasHeight);
}

function boxForPointer(
  event: PointerEvent,
  state: DragState,
  displaySize: DisplaySize | null,
  canvasWidth: number,
  canvasHeight: number,
): BoundingBox {
  if (!displaySize) {
    return state.box;
  }
  const deltaX = ((event.clientX - state.startClientX) / displaySize.width) * canvasWidth;
  const deltaY = ((event.clientY - state.startClientY) / displaySize.height) * canvasHeight;
  if (state.kind === "resize" && state.handle) {
    return resizeBoxForPointer(state.startBox, state.handle, deltaX, deltaY, canvasWidth, canvasHeight);
  }
  return clampBox(
    {
      ...state.startBox,
      x: state.startBox.x + deltaX,
      y: state.startBox.y + deltaY,
    },
    canvasWidth,
    canvasHeight,
  );
}

function PagePreview({ imageUrl }: { imageUrl?: string }) {
  return imageUrl ? (
    <img className="h-full w-full rounded-instrument border border-ink-border object-contain shadow-2xl" src={imageUrl} alt="Selected comic page" />
  ) : (
    <div className="flex h-full w-full items-center justify-center rounded-instrument border border-ink-border bg-surface-low text-text-muted">
      No page preview available
    </div>
  );
}

function ComparisonOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-instrument">
      <div className="absolute inset-y-0 left-1/2 w-px bg-secondary shadow-cyan" />
      <div className="absolute left-3 top-3 rounded-instrument border border-ink-border bg-background/85 px-2 py-1 text-[11px] font-bold uppercase text-text-muted">
        Original
      </div>
      <div className="absolute right-3 top-3 rounded-instrument border border-secondary/60 bg-secondary/15 px-2 py-1 text-[11px] font-bold uppercase text-secondary">
        Translated
      </div>
    </div>
  );
}

function CanvasRegion({
  region,
  active,
  boundingBox,
  canvasWidth,
  canvasHeight,
  displaySize,
  mode,
  onSelectRegion,
  onStartDrag,
  onStartResize,
  onUpdateDrag,
  onFinishDrag,
  onCancelDrag,
}: {
  region: TextRegionRead;
  active: boolean;
  boundingBox: BoundingBox;
  canvasWidth: number;
  canvasHeight: number;
  displaySize: DisplaySize | null;
  mode: "original" | "translated";
  onSelectRegion: (regionId: string) => void;
  onStartDrag: (event: PointerEvent<HTMLDivElement>, region: TextRegionRead) => void;
  onStartResize: (event: PointerEvent<HTMLSpanElement>, region: TextRegionRead, handle: ResizeHandle) => void;
  onUpdateDrag: (event: PointerEvent<HTMLDivElement>) => void;
  onFinishDrag: (event: PointerEvent<HTMLDivElement>) => void;
  onCancelDrag: () => void;
}) {
  const left = (boundingBox.x / canvasWidth) * 100;
  const top = (boundingBox.y / canvasHeight) * 100;
  const boxWidth = (boundingBox.width / canvasWidth) * 100;
  const boxHeight = (boundingBox.height / canvasHeight) * 100;
  const fontSize = renderStyleNumber(region, "fontSize");
  const scaledFontSize = fontSize && displaySize ? Math.max(7, fontSize * (displaySize.width / canvasWidth)) : null;
  const textColor = renderStyleValue(region, ["textColor", "text_color", "color"], DEFAULT_TEXT_COLOR);
  const fillColor = renderStyleValue(
    region,
    ["backgroundColor", "background_color", "fillColor", "fill"],
    mode === "translated" ? DEFAULT_FILL_COLOR : undefined,
  );
  const backgroundColor = fillColor
    ? mode === "translated"
      ? fillColor
      : translucentColor(fillColor)
    : undefined;

  return (
    <div
      role="button"
      aria-current={active ? "true" : undefined}
      tabIndex={0}
      title={`Region ${region.region_index}`}
      onPointerDown={(event) => onStartDrag(event, region)}
      onPointerMove={onUpdateDrag}
      onPointerUp={onFinishDrag}
      onPointerCancel={onCancelDrag}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectRegion(region.id);
        }
      }}
      className={`absolute cursor-move select-none rounded-[3px] text-left transition ${
        active ? "border-2 border-secondary bg-secondary/12 shadow-cyan" : "border-2 border-dashed border-secondary/80 bg-secondary/5 hover:bg-secondary/10"
      }`}
      style={{
        left: `${left}%`,
        top: `${top}%`,
        width: `${boxWidth}%`,
        height: `${boxHeight}%`,
        backgroundColor,
      }}
    >
      {mode === "translated" ? (
        <span
          className="flex h-full w-full items-center justify-center overflow-hidden break-words px-1 text-center font-comic text-[clamp(7px,0.85vw,14px)] font-bold leading-[1.05]"
          style={{ color: textColor, fontSize: scaledFontSize ? `${scaledFontSize}px` : undefined }}
        >
          {region.user_text || region.translated_text || ""}
        </span>
      ) : null}
      {active
        ? RESIZE_HANDLES.map((handle) => (
            <span
              key={handle}
              aria-hidden="true"
              onPointerDown={(event) => onStartResize(event, region, handle)}
              className={`absolute h-3 w-3 rounded-[2px] border border-background bg-secondary shadow-cyan ${handleClassName[handle]}`}
            />
          ))
        : null}
    </div>
  );
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
  zoom = 1,
  comparison = false,
}: {
  imageUrl?: string;
  width?: number | null;
  height?: number | null;
  regions: TextRegionRead[];
  selectedRegionId?: string;
  onSelectRegion: (regionId: string) => void;
  onMoveRegion?: (regionId: string, boundingBox: BoundingBox) => void;
  mode: "original" | "translated";
  zoom?: number;
  comparison?: boolean;
}) {
  const canvasWidth = width ?? 920;
  const canvasHeight = height ?? 1320;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useReducer(containerSizeReducer, { width: 0, height: 0 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const displaySize = useMemo(() => {
    const aspect = canvasWidth / canvasHeight;
    const availableWidth = Math.max(containerSize.width, 0);
    const availableHeight = Math.max(containerSize.height, 0);
    if (!availableWidth || !availableHeight) {
      return null;
    }

    const fitWidth = Math.min(availableWidth, availableHeight * aspect, BASE_FIT_WIDTH);
    const fitHeight = fitWidth / aspect;
    const displayWidth = fitWidth * zoom;
    const displayHeight = fitHeight * zoom;

    return {
      width: Math.max(displayWidth, 1),
      height: Math.max(displayHeight, 1),
    };
  }, [canvasHeight, canvasWidth, containerSize.height, containerSize.width, zoom]);
  const stageSize = useMemo(() => {
    if (!displaySize) {
      return null;
    }
    return {
      width: Math.max(displaySize.width, containerSize.width),
      height: Math.max(displaySize.height, containerSize.height),
    };
  }, [containerSize.height, containerSize.width, displaySize]);

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
      kind: "move",
    });
  }

  function startResize(event: PointerEvent<HTMLSpanElement>, region: TextRegionRead, handle: ResizeHandle) {
    if (!displaySize || !onMoveRegion) {
      onSelectRegion(region.id);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.parentElement?.setPointerCapture(event.pointerId);
    onSelectRegion(region.id);
    setDrag({
      regionId: region.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBox: region.bounding_box,
      box: region.bounding_box,
      kind: "resize",
      handle,
    });
  }

  function updateDrag(event: PointerEvent<HTMLDivElement>) {
    setDrag((current) => {
      if (!current || current.pointerId !== event.pointerId) {
        return current;
      }
      return { ...current, box: boxForPointer(event, current, displaySize, canvasWidth, canvasHeight) };
    });
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
    const changed =
      drag.box.x !== drag.startBox.x ||
      drag.box.y !== drag.startBox.y ||
      drag.box.width !== drag.startBox.width ||
      drag.box.height !== drag.startBox.height;
    if (changed) {
      onMoveRegion?.(drag.regionId, drag.box);
    }
    setDrag(null);
  }

  return (
    <div ref={containerRef} className="min-h-[240px] min-w-0 flex-1 overflow-auto bg-background p-3 md:p-4 lg:min-h-0 lg:p-8">
      <div
        className="flex min-h-full min-w-full items-center justify-center"
        style={{
          width: stageSize?.width ?? "100%",
          height: stageSize?.height ?? "100%",
        }}
      >
        <div
          className="relative shrink-0"
          style={{
            aspectRatio: `${canvasWidth} / ${canvasHeight}`,
            width: displaySize?.width ?? "100%",
            height: displaySize?.height ?? "auto",
          }}
        >
          <PagePreview imageUrl={imageUrl} />

          {comparison ? <ComparisonOverlay /> : null}

          {regions.map((region) => {
            const active = region.id === selectedRegionId;
            const boundingBox = drag?.regionId === region.id ? drag.box : region.bounding_box;
            return (
              <CanvasRegion
                key={region.id}
                region={region}
                active={active}
                boundingBox={boundingBox}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
                displaySize={displaySize}
                mode={mode}
                onSelectRegion={onSelectRegion}
                onStartDrag={startDrag}
                onStartResize={startResize}
                onUpdateDrag={updateDrag}
                onFinishDrag={finishDrag}
                onCancelDrag={() => setDrag(null)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
