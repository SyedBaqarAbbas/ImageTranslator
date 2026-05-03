import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import { CanvasWorkspace } from "./CanvasWorkspace";
import type { TextRegionRead } from "../types/api";

const region: TextRegionRead = {
  id: "region-1",
  page_id: "page-1",
  region_index: 1,
  region_type: "speech",
  bounding_box: { x: 10, y: 20, width: 120, height: 80 },
  polygon: null,
  detected_text: "source text",
  detected_language: "ja",
  translated_text: "Machine translation",
  user_text: null,
  ocr_confidence: 0.9,
  translation_confidence: 0.85,
  render_style: null,
  editable: true,
  status: "translated",
  failure_reason: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

function renderWorkspace(
  regionOverride: Partial<TextRegionRead> = {},
  mode: "original" | "translated" = "translated",
  props: Partial<ComponentProps<typeof CanvasWorkspace>> = {},
) {
  return render(
    <CanvasWorkspace
      imageUrl="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
      width={240}
      height={320}
      regions={[{ ...region, ...regionOverride }]}
      selectedRegionId="region-1"
      onSelectRegion={vi.fn()}
      mode={mode}
      {...props}
    />,
  );
}

describe("CanvasWorkspace", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 600,
      right: 800,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (element) =>
        ({
          paddingLeft: "0px",
          paddingRight: "0px",
          paddingTop: "0px",
          paddingBottom: "0px",
          getPropertyValue: (property: string) => {
            const normalized = property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
            if (normalized.startsWith("padding-")) {
              return "0px";
            }
            return element instanceof HTMLElement ? element.style.getPropertyValue(normalized) : "";
          },
        }) as CSSStyleDeclaration,
    );
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the default fill opacity for translated overlays without saved opacity", () => {
    renderWorkspace();

    expect(screen.getByTitle("Region 1")).toHaveStyle({ backgroundColor: "rgba(255, 255, 255, 0.27)" });
  });

  it("applies saved fill opacity to translated overlays", () => {
    renderWorkspace({ render_style: { backgroundColor: "#336699", fillOpacity: 0.5 } });

    expect(screen.getByTitle("Region 1")).toHaveStyle({ backgroundColor: "rgba(51, 102, 153, 0.5)" });
    expect(screen.getByText("Machine translation")).toBeInTheDocument();
  });

  it("applies saved fill opacity to legacy fill color keys", () => {
    renderWorkspace({ render_style: { fillColor: "#0f8", fillOpacity: 0 } }, "original");

    expect(screen.getByTitle("Region 1")).toHaveStyle({ backgroundColor: "rgba(0, 255, 136, 0)" });
  });

  it("renders a fallback preview when no image is available", () => {
    render(
      <CanvasWorkspace
        regions={[]}
        selectedRegionId={undefined}
        onSelectRegion={vi.fn()}
        mode="translated"
      />,
    );

    expect(screen.getByText("No page preview available")).toBeInTheDocument();
  });

  it("selects regions from keyboard input", () => {
    const onSelectRegion = vi.fn();
    renderWorkspace({}, "translated", { selectedRegionId: undefined, onSelectRegion });

    fireEvent.keyDown(screen.getByTitle("Region 1"), { key: "Enter" });
    fireEvent.keyDown(screen.getByTitle("Region 1"), { key: " " });

    expect(onSelectRegion).toHaveBeenCalledTimes(2);
    expect(onSelectRegion).toHaveBeenCalledWith("region-1");
  });

  it("moves and resizes regions within canvas bounds", () => {
    const onMoveRegion = vi.fn();
    const { container } = renderWorkspace({}, "translated", { onMoveRegion });
    const regionButton = screen.getByTitle("Region 1");

    fireEvent.pointerDown(regionButton, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(regionButton, { pointerId: 1, clientX: 200, clientY: 160 });
    fireEvent.pointerUp(regionButton, { pointerId: 1, clientX: 200, clientY: 160 });

    expect(onMoveRegion).toHaveBeenCalledWith(
      "region-1",
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );

    onMoveRegion.mockClear();
    const resizeHandle = container.querySelector(".cursor-nwse-resize");
    expect(resizeHandle).not.toBeNull();
    fireEvent.pointerDown(resizeHandle!, { pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(regionButton, { pointerId: 2, clientX: 170, clientY: 150 });
    fireEvent.pointerUp(regionButton, { pointerId: 2, clientX: 170, clientY: 150 });

    expect(onMoveRegion).toHaveBeenCalledWith(
      "region-1",
      expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }),
    );
  });

  it("adjusts comparison split by keyboard and pointer", () => {
    const onComparisonSplitChange = vi.fn();
    renderWorkspace({}, "translated", {
      comparison: true,
      comparisonSplit: 50,
      onComparisonSplitChange,
    });
    const separator = screen.getByRole("separator", { name: "Compare split position" });

    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    fireEvent.keyDown(separator, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(separator, { key: "Home" });
    fireEvent.keyDown(separator, { key: "End" });
    expect(onComparisonSplitChange).toHaveBeenCalledWith(48);
    expect(onComparisonSplitChange).toHaveBeenCalledWith(60);
    expect(onComparisonSplitChange).toHaveBeenCalledWith(5);
    expect(onComparisonSplitChange).toHaveBeenCalledWith(95);
  });
});
