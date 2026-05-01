import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
const panelWidthStorageKey = "imageTranslator.editor.regionPanelWidth";
const panelHeightStorageKey = "imageTranslator.editor.regionPanelHeight";

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1440 });
});

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

  it("previews and saves fill opacity style changes", () => {
    const onSave = vi.fn();
    const onStyleDraftChange = vi.fn();
    renderRegionPanel({ onSave, onStyleDraftChange }, { render_style: { fontSize: 24, backgroundColor: "#ffeeaa" } });

    const fillOpacity = screen.getByLabelText(/fill opacity/i);
    expect(fillOpacity).toHaveValue("0.27");
    expect(screen.getByText("27%")).toBeInTheDocument();

    fireEvent.change(fillOpacity, { target: { value: "0.5" } });

    expect(onStyleDraftChange).toHaveBeenLastCalledWith(
      "region-1",
      expect.objectContaining({
        backgroundColor: "#ffeeaa",
        fillOpacity: 0.5,
      }),
    );
    expect(screen.getByText("50%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(onSave).toHaveBeenCalledWith(
      "region-1",
      expect.objectContaining({
        render_style: expect.objectContaining({
          backgroundColor: "#ffeeaa",
          fillOpacity: 0.5,
        }),
      }),
      "save",
    );
  });

  it("restores saved fill opacity in the style controls", () => {
    renderRegionPanel({}, { render_style: { fontSize: 24, fillOpacity: "0.85" } });

    expect(screen.getByLabelText(/fill opacity/i)).toHaveValue("0.85");
    expect(screen.getByText("85%")).toBeInTheDocument();
  });

  it("uses a clear retranslate action and sends OCR source text", () => {
    const onRetranslate = vi.fn();
    renderRegionPanel({ onRetranslate });

    const button = screen.getByRole("button", { name: /retranslate region/i });

    expect(button).toHaveTextContent("Retranslate");
    expect(screen.queryByText(/^AI$/)).not.toBeInTheDocument();
    expect(screen.getByText("Input: OCR source text")).toBeInTheDocument();

    fireEvent.click(button);

    expect(onRetranslate).toHaveBeenCalledWith("region-1", "source text", "detected_text");
  });

  it("makes the target draft fallback visible before retranslating", () => {
    const onRetranslate = vi.fn();
    renderRegionPanel(
      { onRetranslate },
      {
        detected_text: null,
        translated_text: "Existing target draft",
        user_text: null,
      },
    );

    expect(screen.getByText("Input: current target draft")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retranslate region/i }));

    expect(onRetranslate).toHaveBeenCalledWith("region-1", "Existing target draft", "target_draft");
  });

  it("disables retranslation when there is no source or draft text", () => {
    const onRetranslate = vi.fn();
    renderRegionPanel(
      { onRetranslate },
      {
        detected_text: null,
        translated_text: null,
        user_text: null,
      },
    );

    const button = screen.getByRole("button", { name: /retranslate region/i });

    expect(button).toBeDisabled();
    expect(button.getAttribute("title")).toMatch(/Add OCR source text/);
    expect(screen.getByText("Add OCR source text or a target draft before retranslating.")).toBeInTheDocument();

    fireEvent.click(button);

    expect(onRetranslate).not.toHaveBeenCalled();
  });

  it("shows retranslation pending feedback on the action", () => {
    renderRegionPanel({
      retranslateFeedback: {
        regionId: "region-1",
        status: "pending",
        message: "Translating from OCR source text.",
      },
    });

    expect(screen.getByRole("button", { name: /translating region/i })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Translating from OCR source text.");
  });

  it("shows retranslation success and error feedback", () => {
    const { unmount } = renderRegionPanel({
      retranslateFeedback: {
        regionId: "region-1",
        status: "success",
        message: "Translation updated.",
      },
    });

    expect(screen.getByRole("status")).toHaveTextContent("Translation updated.");

    unmount();
    renderRegionPanel({
      retranslateFeedback: {
        regionId: "region-1",
        status: "error",
        message: "Translation failed: Provider unavailable.",
      },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Translation failed: Provider unavailable.");
  });

  it("uses and persists the default desktop width for first-time sessions", () => {
    renderRegionPanel();

    const separator = screen.getByRole("separator", { name: /resize translation cards panel width/i });
    expect(separator).toHaveAttribute("aria-valuenow", "360");
    expect(window.localStorage.getItem(panelWidthStorageKey)).toBe("360");
    expect(window.localStorage.getItem(panelHeightStorageKey)).toBeTruthy();
  });

  it("resizes the desktop panel with the keyboard and persists the width", () => {
    window.localStorage.setItem(panelWidthStorageKey, "520");
    renderRegionPanel();

    const separator = screen.getByRole("separator", { name: /resize translation cards panel width/i });
    expect(separator).toHaveAttribute("aria-orientation", "vertical");
    expect(separator).toHaveAttribute("aria-valuenow", "520");
    expect(separator).toHaveAttribute("aria-valuemax", "560");

    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(separator).toHaveAttribute("aria-valuenow", "544");
    expect(window.localStorage.getItem(panelWidthStorageKey)).toBe("544");

    fireEvent.keyDown(separator, { key: "End" });
    expect(separator).toHaveAttribute("aria-valuenow", "560");

    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(separator).toHaveAttribute("aria-valuenow", "560");

    fireEvent.keyDown(separator, { key: "Home" });
    expect(separator).toHaveAttribute("aria-valuenow", "300");
  });

  it("preserves saved desktop width when rendered on a narrow viewport", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 390 });
    window.localStorage.setItem(panelWidthStorageKey, "520");
    renderRegionPanel();

    const separator = screen.getByRole("separator", { name: /resize translation cards panel width/i });
    expect(separator).toHaveAttribute("aria-valuenow", "300");
    expect(window.localStorage.getItem(panelWidthStorageKey)).toBe("520");

    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1440 });
    fireEvent(window, new Event("resize"));

    expect(separator).toHaveAttribute("aria-valuenow", "520");
    expect(window.localStorage.getItem(panelWidthStorageKey)).toBe("520");
  });

  it("resizes the stacked panel height with keyboard controls and persists the height", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 390 });
    Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: 900 });
    window.localStorage.setItem(panelHeightStorageKey, "460");
    renderRegionPanel();

    const separator = screen.getByRole("separator", { name: /resize translation cards panel height/i });
    expect(separator).toHaveAttribute("aria-orientation", "horizontal");
    expect(separator).toHaveAttribute("aria-valuenow", "460");

    fireEvent.keyDown(separator, { key: "ArrowUp" });
    expect(separator).toHaveAttribute("aria-valuenow", "484");
    expect(window.localStorage.getItem(panelHeightStorageKey)).toBe("484");

    fireEvent.keyDown(separator, { key: "Home" });
    expect(separator).toHaveAttribute("aria-valuenow", "260");

    fireEvent.keyDown(separator, { key: "End" });
    expect(separator).toHaveAttribute("aria-valuenow", separator.getAttribute("aria-valuemax"));
  });
});
