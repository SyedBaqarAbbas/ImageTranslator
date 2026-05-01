import { useEffect, useMemo, useReducer } from "react";
import { BrainCircuit, Pipette, Save, Sparkles, Trash2 } from "lucide-react";

import { statusLabel } from "../lib/routing";
import type { TextRegionRead, TextRegionUpdate } from "../types/api";
import { StatusPill } from "./StatusPill";

interface EyeDropperResult {
  sRGBHex: string;
}

interface EyeDropperInstance {
  open: () => Promise<EyeDropperResult>;
}

interface EyeDropperConstructor {
  new (): EyeDropperInstance;
}

declare global {
  interface Window {
    EyeDropper?: EyeDropperConstructor;
  }
}

type StyleDraft = Record<string, unknown>;
type ColorStyleKey = "textColor" | "backgroundColor";
export type RegionSaveAction = "save" | "approve";
type RegionSaveStatus = "pending" | "success" | "error";

export interface RegionSaveFeedback {
  regionId: string;
  action: RegionSaveAction;
  status: RegionSaveStatus;
  message: string;
}

const DEFAULT_TEXT_COLOR = "#0f172a";
const DEFAULT_FILL_COLOR = "#ffffff";

interface RegionPanelState {
  draft: string;
  aiStatus: string;
  styleDraft: StyleDraft;
  styleNotice: string | null;
}

type RegionPanelAction =
  | { type: "reset"; region?: TextRegionRead }
  | { type: "setDraft"; draft: string }
  | { type: "setAiStatus"; aiStatus: string }
  | { type: "setStyle"; styleDraft: StyleDraft }
  | { type: "setStyleNotice"; styleNotice: string | null };

function stateForRegion(region?: TextRegionRead): RegionPanelState {
  return {
    draft: region?.user_text || region?.translated_text || "",
    aiStatus: "AI",
    styleDraft: { ...(region?.render_style ?? {}) },
    styleNotice: null,
  };
}

function regionPanelReducer(state: RegionPanelState, action: RegionPanelAction): RegionPanelState {
  switch (action.type) {
    case "reset":
      return stateForRegion(action.region);
    case "setDraft":
      return { ...state, draft: action.draft };
    case "setAiStatus":
      return { ...state, aiStatus: action.aiStatus };
    case "setStyle":
      return { ...state, styleDraft: action.styleDraft, styleNotice: null };
    case "setStyleNotice":
      return { ...state, styleNotice: action.styleNotice };
  }
}

function colorValue(style: StyleDraft, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = style[key];
    if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) {
      return value;
    }
    if (typeof value === "string" && /^#[0-9a-f]{3}$/i.test(value)) {
      return `#${value
        .slice(1)
        .split("")
        .map((character) => `${character}${character}`)
        .join("")}`;
    }
  }
  return fallback;
}

function numberValue(style: StyleDraft, key: string, fallback: number): number {
  const value = style[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function RegionPanel({
  regions,
  selectedRegionId,
  onSelect,
  onSave,
  onRetranslate,
  onDelete,
  onStyleDraftChange,
  onDraftChange,
  saveFeedback = null,
  isDeleting = false,
}: {
  regions: TextRegionRead[];
  selectedRegionId?: string;
  onSelect: (regionId: string) => void;
  onSave: (regionId: string, payload: TextRegionUpdate, action: RegionSaveAction) => void;
  onRetranslate: (regionId: string, sourceText: string) => void;
  onDelete: (regionId: string) => void;
  onStyleDraftChange?: (regionId: string, renderStyle: StyleDraft) => void;
  onDraftChange?: (regionId: string) => void;
  saveFeedback?: RegionSaveFeedback | null;
  isDeleting?: boolean;
}) {
  const selectedRegion = useMemo(
    () => regions.find((region) => region.id === selectedRegionId) ?? regions[0],
    [regions, selectedRegionId],
  );
  const [{ draft, aiStatus, styleDraft, styleNotice }, dispatchPanel] = useReducer(
    regionPanelReducer,
    selectedRegion,
    stateForRegion,
  );

  useEffect(() => {
    dispatchPanel({ type: "reset", region: selectedRegion });
  }, [selectedRegion]);

  const selectedSaveFeedback = selectedRegion && saveFeedback?.regionId === selectedRegion.id ? saveFeedback : null;
  const isSavePending = selectedSaveFeedback?.status === "pending" && selectedSaveFeedback.action === "save";
  const isApprovePending = selectedSaveFeedback?.status === "pending" && selectedSaveFeedback.action === "approve";
  const isSaveActionPending = selectedSaveFeedback?.status === "pending";
  const canEditSelectedRegion = selectedRegion?.editable !== false && !isSaveActionPending;
  const textColor = colorValue(styleDraft, ["textColor", "text_color", "color"], DEFAULT_TEXT_COLOR);
  const backgroundColor = colorValue(styleDraft, ["backgroundColor", "background_color", "fillColor", "fill"], DEFAULT_FILL_COLOR);
  const fontSize = Math.max(8, Math.min(72, Math.round(numberValue(styleDraft, "fontSize", 24))));

  function updateStyle(patch: StyleDraft) {
    if (!selectedRegion || !canEditSelectedRegion) {
      return;
    }
    const next = { ...styleDraft, ...patch };
    dispatchPanel({ type: "setStyle", styleDraft: next });
    onStyleDraftChange?.(selectedRegion.id, next);
  }

  async function pickColor(styleKey: ColorStyleKey) {
    if (!selectedRegion || !canEditSelectedRegion) {
      return;
    }
    if (!window.EyeDropper) {
      dispatchPanel({ type: "setStyleNotice", styleNotice: "Eyedropper is not available in this browser. Use the color input instead." });
      return;
    }
    try {
      const result = await new window.EyeDropper().open();
      updateStyle({ [styleKey]: result.sRGBHex });
    } catch {
      dispatchPanel({ type: "setStyleNotice", styleNotice: "Color pick cancelled." });
    }
  }

  return (
    <aside className="flex h-[52vh] min-h-0 w-full shrink-0 flex-col border-t border-ink-border bg-surface-low lg:h-auto lg:w-[360px] lg:border-l lg:border-t-0">
      <div className="shrink-0 border-b border-ink-border p-4">
        <p className="text-xs font-bold uppercase text-secondary">Translation Cards</p>
        <h2 className="mt-1 font-display text-lg font-bold text-white">{regions.length} detected regions</h2>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {regions.map((region) => (
            <article
              key={region.id}
              className={`w-full rounded-lg border p-2 text-left transition lg:p-3 ${
                region.id === selectedRegion?.id ? "border-secondary bg-secondary/10" : "border-ink-border bg-surface hover:border-primary/50"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(region.id)}
                disabled={region.id === selectedRegion?.id}
                aria-current={region.id === selectedRegion?.id ? "true" : undefined}
                className="w-full text-left disabled:cursor-default"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold uppercase text-text-muted lg:text-xs">
                    #{region.region_index} {statusLabel(region.region_type)}
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusPill status={region.status} />
                    {!region.editable ? (
                      <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-200">
                        Approved
                      </span>
                    ) : null}
                  </span>
                </div>
                <p className="line-clamp-1 text-sm text-text-main lg:line-clamp-2">{region.user_text || region.translated_text || "Untranslated"}</p>
                <p className="mt-2 hidden text-xs text-text-muted lg:block">
                  OCR {Math.round((region.ocr_confidence ?? 0) * 100)}% · Translation {Math.round((region.translation_confidence ?? 0) * 100)}%
                </p>
              </button>
              <button
                type="button"
                onClick={() => onDelete(region.id)}
                disabled={isDeleting}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-instrument border border-danger/40 px-3 py-2 text-xs font-bold text-danger transition hover:bg-danger/10 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Reject
              </button>
            </article>
          ))}
        </div>
      </div>

      {selectedRegion ? (
        <div className="shrink-0 border-t border-ink-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-text-muted">Source</p>
              <p className="mt-1 text-sm text-text-main">{selectedRegion.detected_text || "No OCR text"}</p>
            </div>
            <button
              onClick={() => {
                dispatchPanel({ type: "setAiStatus", aiStatus: "Queued" });
                onRetranslate(selectedRegion.id, selectedRegion.detected_text || draft);
              }}
              className="inline-flex items-center gap-2 rounded-instrument border border-primary/40 px-3 py-2 text-xs font-bold text-primary-soft transition hover:bg-primary/10"
            >
              <BrainCircuit className="h-4 w-4" />
              {aiStatus}
            </button>
          </div>
          <label className="block">
            <span className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase text-secondary">Target</span>
              {!selectedRegion.editable ? (
                <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-200">
                  Approved
                </span>
              ) : null}
            </span>
            <textarea
              value={draft}
              onChange={(event) => {
                dispatchPanel({ type: "setDraft", draft: event.target.value });
                onDraftChange?.(selectedRegion.id);
              }}
              disabled={!canEditSelectedRegion}
              className="mt-2 min-h-20 w-full resize-none rounded-instrument border border-ink-border bg-background p-3 text-sm text-text-main outline-none transition focus:border-secondary focus:ring-1 focus:ring-secondary disabled:cursor-not-allowed disabled:opacity-65 lg:min-h-28"
            />
          </label>
          <div className="mt-3 rounded-lg border border-ink-border bg-background p-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-bold uppercase text-text-muted">Text color</span>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="color"
                    value={textColor}
                    onChange={(event) => updateStyle({ textColor: event.target.value })}
                    disabled={!canEditSelectedRegion}
                    className="h-9 w-11 rounded-instrument border border-ink-border bg-surface p-1 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Text color"
                  />
                  <button
                    type="button"
                    onClick={() => pickColor("textColor")}
                    disabled={!canEditSelectedRegion}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-instrument border border-ink-border px-2 text-xs font-bold text-text-main transition hover:bg-surface-high disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Pipette className="h-3.5 w-3.5" />
                    Pick
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-text-muted">Box fill</span>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="color"
                    value={backgroundColor}
                    onChange={(event) => updateStyle({ backgroundColor: event.target.value })}
                    disabled={!canEditSelectedRegion}
                    className="h-9 w-11 rounded-instrument border border-ink-border bg-surface p-1 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Box fill color"
                  />
                  <button
                    type="button"
                    onClick={() => pickColor("backgroundColor")}
                    disabled={!canEditSelectedRegion}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-instrument border border-ink-border px-2 text-xs font-bold text-text-main transition hover:bg-surface-high disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Pipette className="h-3.5 w-3.5" />
                    Pick
                  </button>
                </div>
              </label>
            </div>
            <label className="mt-3 block">
              <span className="text-xs font-bold uppercase text-text-muted">Text size</span>
              <input
                type="range"
                min="8"
                max="72"
                value={fontSize}
                onChange={(event) => updateStyle({ fontSize: Number(event.target.value) })}
                disabled={!canEditSelectedRegion}
                className="mt-2 w-full accent-primary disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Text size"
              />
            </label>
            {styleNotice ? <p className="mt-2 text-xs font-semibold text-tertiary">{styleNotice}</p> : null}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <button
              onClick={() => onSave(selectedRegion.id, { user_text: draft, render_style: styleDraft, auto_rerender: true }, "save")}
              disabled={!canEditSelectedRegion}
              aria-busy={isSavePending}
              className="inline-flex items-center justify-center gap-2 rounded-instrument bg-primary px-3 py-2 text-sm font-bold text-white shadow-glow transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {isSavePending ? "Saving" : "Save"}
            </button>
            <button
              onClick={() => onSave(selectedRegion.id, { user_text: draft, render_style: styleDraft, editable: false, auto_rerender: true }, "approve")}
              disabled={!canEditSelectedRegion}
              aria-busy={isApprovePending}
              className="inline-flex items-center justify-center gap-2 rounded-instrument border border-ink-border px-3 py-2 text-sm font-bold text-text-main transition hover:bg-surface-high disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              {isApprovePending ? "Approving" : selectedRegion.editable ? "Approve" : "Approved"}
            </button>
            <button
              onClick={() => onDelete(selectedRegion.id)}
              disabled={isDeleting}
              className="inline-flex items-center justify-center gap-2 rounded-instrument border border-danger/40 px-3 py-2 text-sm font-bold text-danger transition hover:bg-danger/10 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              Reject
            </button>
          </div>
          {selectedSaveFeedback ? (
            <p
              role={selectedSaveFeedback.status === "error" ? "alert" : "status"}
              className={`mt-3 text-xs font-semibold ${
                selectedSaveFeedback.status === "error"
                  ? "text-danger"
                  : selectedSaveFeedback.status === "success"
                    ? "text-emerald-300"
                    : "text-secondary"
              }`}
            >
              {selectedSaveFeedback.message}
            </p>
          ) : !selectedRegion.editable ? (
            <p role="status" className="mt-3 text-xs font-semibold text-emerald-300">
              Approved and locked.
            </p>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
