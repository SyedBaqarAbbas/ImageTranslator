import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import { RegionPanel } from "./RegionPanel";
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
  render_style: { fontSize: 24, textColor: "#111111" },
  editable: true,
  status: "translated",
  failure_reason: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

function renderRegionPanel(
  props: Partial<ComponentProps<typeof RegionPanel>> = {},
  regionOverride: Partial<TextRegionRead> = {},
) {
  return render(
    <RegionPanel
      regions={[{ ...region, ...regionOverride }]}
      selectedRegionId="region-1"
      onSelect={vi.fn()}
      onSave={vi.fn()}
      onRetranslate={vi.fn()}
      onDelete={vi.fn()}
      {...props}
    />,
  );
}

describe("RegionPanel", () => {
  it("approves the current target draft", () => {
    const onSave = vi.fn();
    renderRegionPanel({ onSave });

    fireEvent.change(screen.getByLabelText(/target/i), { target: { value: "Human edited translation" } });
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));

    expect(onSave).toHaveBeenCalledWith(
      "region-1",
      expect.objectContaining({
        user_text: "Human edited translation",
        editable: false,
        auto_rerender: true,
      }),
      "approve",
    );
  });

  it("shows pending feedback on the save button", () => {
    renderRegionPanel({
      saveFeedback: {
        regionId: "region-1",
        action: "save",
        status: "pending",
        message: "Saving...",
      },
    });

    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Saving...");
  });
});
