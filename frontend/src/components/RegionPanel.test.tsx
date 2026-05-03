import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const selectedRegionHeightStorageKey = "imageTranslator.editor.selectedRegionHeight";
const originalSetPointerCapture = HTMLElement.prototype.setPointerCapture;
const originalReleasePointerCapture = HTMLElement.prototype.releasePointerCapture;
const originalHasPointerCapture = HTMLElement.prototype.hasPointerCapture;

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1440 });
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: 900 });
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
});

afterEach(() => {
  delete window.EyeDropper;
  HTMLElement.prototype.setPointerCapture = originalSetPointerCapture;
  HTMLElement.prototype.releasePointerCapture = originalReleasePointerCapture;
  HTMLElement.prototype.hasPointerCapture = originalHasPointerCapture;
  vi.restoreAllMocks();
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

function firePointerEvent(target: Element, type: string, properties: Record<string, number>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(
    event,
    Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, { configurable: true, value }])),
  );
  fireEvent(target, event);
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

  it("locks approved regions from edits, saves, and retranslation", () => {
    const onSave = vi.fn();
    const onRetranslate = vi.fn();
    renderRegionPanel({ onSave, onRetranslate }, { editable: false, user_text: "Approved copy" });

    expect(screen.getByLabelText(/target/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^approved$/i })).toBeDisabled();

    const retranslateButton = screen.getByRole("button", { name: /retranslate region/i });
    expect(retranslateButton).toBeDisabled();
    expect(retranslateButton).toHaveAttribute("title", "Approved regions cannot be retranslated.");
    fireEvent.click(retranslateButton);

    expect(onSave).not.toHaveBeenCalled();
    expect(onRetranslate).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Approved and locked.");
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

  it("normalizes style values and previews color and text-size changes", () => {
    const onStyleDraftChange = vi.fn();
    renderRegionPanel(
      { onStyleDraftChange },
      {
        render_style: {
          text_color: "#abc",
          background_color: "#def",
          fontSize: "18",
        },
      },
    );

    expect(screen.getByLabelText("Text color")).toHaveValue("#aabbcc");
    expect(screen.getByLabelText("Box fill color")).toHaveValue("#ddeeff");
    expect(screen.getByLabelText("Text size")).toHaveValue("18");

    fireEvent.change(screen.getByLabelText("Text color"), { target: { value: "#123456" } });
    expect(onStyleDraftChange).toHaveBeenLastCalledWith(
      "region-1",
      expect.objectContaining({
        textColor: "#123456",
      }),
    );

    fireEvent.change(screen.getByLabelText("Box fill color"), { target: { value: "#654321" } });
    expect(onStyleDraftChange).toHaveBeenLastCalledWith(
      "region-1",
      expect.objectContaining({
        backgroundColor: "#654321",
      }),
    );

    fireEvent.change(screen.getByLabelText("Text size"), { target: { value: "32" } });
    expect(onStyleDraftChange).toHaveBeenLastCalledWith(
      "region-1",
      expect.objectContaining({
        fontSize: 32,
      }),
    );
  });

  it("uses the browser eyedropper when available", async () => {
    const onStyleDraftChange = vi.fn();
    class EyeDropperMock {
      open = vi.fn().mockResolvedValue({ sRGBHex: "#2468ac" });
    }
    window.EyeDropper = EyeDropperMock;

    renderRegionPanel({ onStyleDraftChange });

    fireEvent.click(screen.getAllByRole("button", { name: /pick/i })[0]);

    await waitFor(() => {
      expect(onStyleDraftChange).toHaveBeenCalledWith(
        "region-1",
        expect.objectContaining({
          textColor: "#2468ac",
        }),
      );
    });
  });

  it("explains eyedropper unsupported and cancelled states", async () => {
    renderRegionPanel();

    fireEvent.click(screen.getAllByRole("button", { name: /pick/i })[0]);

    expect(screen.getByText("Eyedropper is not available in this browser. Use the color input instead.")).toBeInTheDocument();

    class EyeDropperMock {
      open = vi.fn().mockRejectedValue(new Error("cancelled"));
    }
    window.EyeDropper = EyeDropperMock;

    fireEvent.click(screen.getAllByRole("button", { name: /pick/i })[1]);

    expect(await screen.findByText("Color pick cancelled.")).toBeInTheDocument();
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

  it("selects and rejects regions from the translation card list", () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    render(
      <RegionPanel
        regions={[
          region,
          {
            ...region,
            id: "region-2",
            region_index: 2,
            status: "rendered",
            editable: false,
            user_text: "Approved second region",
          },
        ]}
        selectedRegionId="region-1"
        onSelect={onSelect}
        onSave={vi.fn()}
        onRetranslate={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByText("Approved second region").closest("button")!);
    fireEvent.click(screen.getAllByRole("button", { name: /reject/i })[1]);

    expect(onSelect).toHaveBeenCalledWith("region-2");
    expect(onDelete).toHaveBeenCalledWith("region-2");
    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
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

  it("resizes desktop and stacked panels with pointer dragging", () => {
    const { unmount } = renderRegionPanel();

    const widthSeparator = screen.getByRole("separator", { name: /resize translation cards panel width/i });
    firePointerEvent(widthSeparator, "pointerdown", { pointerId: 1, clientX: 500 });
    firePointerEvent(widthSeparator, "pointermove", { pointerId: 99, clientX: 200 });
    expect(widthSeparator).toHaveAttribute("aria-valuenow", "360");
    firePointerEvent(widthSeparator, "pointermove", { pointerId: 1, clientX: 460 });
    expect(widthSeparator).toHaveAttribute("aria-valuenow", "400");
    firePointerEvent(widthSeparator, "pointerup", { pointerId: 1, clientX: 460 });
    expect(window.localStorage.getItem(panelWidthStorageKey)).toBe("400");

    unmount();
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 390 });
    renderRegionPanel();

    const heightSeparator = screen.getByRole("separator", { name: /resize translation cards panel height/i });
    firePointerEvent(heightSeparator, "pointerdown", { pointerId: 2, clientY: 300 });
    firePointerEvent(heightSeparator, "pointermove", { pointerId: 2, clientY: 260 });
    expect(heightSeparator).toHaveAttribute("aria-valuenow", "508");
    firePointerEvent(heightSeparator, "pointercancel", { pointerId: 2, clientY: 260 });
    expect(window.localStorage.getItem(panelHeightStorageKey)).toBe("508");
  });

  it("resizes the selected-region editor by keyboard and pointer", () => {
    renderRegionPanel();

    const separator = screen.getByRole("separator", { name: /resize selected region editor/i });
    expect(separator).toHaveAttribute("aria-valuenow", "420");

    fireEvent.keyDown(separator, { key: "ArrowUp" });
    expect(separator).toHaveAttribute("aria-valuenow", "444");

    fireEvent.keyDown(separator, { key: "Home" });
    expect(separator).toHaveAttribute("aria-valuenow", "260");

    firePointerEvent(separator, "pointerdown", { pointerId: 3, clientY: 300 });
    firePointerEvent(separator, "pointermove", { pointerId: 3, clientY: 220 });
    expect(separator).toHaveAttribute("aria-valuenow", "340");
    firePointerEvent(separator, "lostpointercapture", { pointerId: 3 });

    expect(window.localStorage.getItem(selectedRegionHeightStorageKey)).toBe("340");
  });
});
