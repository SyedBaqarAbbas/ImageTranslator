import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function renderWorkspace(regionOverride: Partial<TextRegionRead> = {}, mode: "original" | "translated" = "translated") {
  return render(
    <CanvasWorkspace
      imageUrl="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
      width={240}
      height={320}
      regions={[{ ...region, ...regionOverride }]}
      selectedRegionId="region-1"
      onSelectRegion={vi.fn()}
      mode={mode}
    />,
  );
}

describe("CanvasWorkspace", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
});
