import { useEffect, useMemo, useState } from "react";
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

const DEFAULT_TEXT_COLOR = "#0f172a";
const DEFAULT_FILL_COLOR = "#ffffff";

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
  isSaving = false,
  isDeleting = false,
}: {
  regions: TextRegionRead[];
  selectedRegionId?: string;
  onSelect: (regionId: string) => void;
  onSave: (regionId: string, payload: TextRegionUpdate) => void;
  onRetranslate: (regionId: string, sourceText: string) => void;
  onDelete: (regionId: string) => void;
  onStyleDraftChange?: (regionId: string, renderStyle: StyleDraft) => void;
  isSaving?: boolean;
  isDeleting?: boolean;
}) {
  const selectedRegion = useMemo(
    () => regions.find((region) => region.id === selectedRegionId) ?? regions[0],
    [regions, selectedRegionId],
  );
  const [draft, setDraft] = useState("");
  const [aiStatus, setAiStatus] = useState("AI");
  const [styleDraft, setStyleDraft] = useState<StyleDraft>({});
  const [styleNotice, setStyleNotice] = useState<string | null>(null);

  useEffect(() => {
    setDraft(selectedRegion?.user_text || selectedRegion?.translated_text || "");
    setAiStatus("AI");
    setStyleDraft({ ...(selectedRegion?.render_style ?? {}) });
    setStyleNotice(null);
  }, [selectedRegion?.id, selectedRegion?.render_style, selectedRegion?.translated_text, selectedRegion?.user_text]);

  const textColor = colorValue(styleDraft, ["textColor", "text_color", "color"], DEFAULT_TEXT_COLOR);
  const backgroundColor = colorValue(styleDraft, ["backgroundColor", "background_color", "fillColor", "fill"], DEFAULT_FILL_COLOR);
  const fontSize = Math.max(8, Math.min(72, Math.round(numberValue(styleDraft, "fontSize", 24))));

  function updateStyle(patch: StyleDraft) {
    if (!selectedRegion) {
      return;
    }
    const next = { ...styleDraft, ...patch };
    setStyleDraft(next);
    setStyleNotice(null);
    onStyleDraftChange?.(selectedRegion.id, next);
  }

  async function pickColor(styleKey: ColorStyleKey) {
    if (!selectedRegion) {
      return;
    }
    if (!window.EyeDropper) {
      setStyleNotice("Eyedropper is not available in this browser. Use the color input instead.");
      return;
    }
    try {
      const result = await new window.EyeDropper().open();
      updateStyle({ [styleKey]: result.sRGBHex });
    } catch {
      setStyleNotice("Color pick cancelled.");
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
                  <StatusPill status={region.status} />
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
                setAiStatus("Queued");
                onRetranslate(selectedRegion.id, selectedRegion.detected_text || draft);
              }}
              className="inline-flex items-center gap-2 rounded-instrument border border-primary/40 px-3 py-2 text-xs font-bold text-primary-soft transition hover:bg-primary/10"
            >
              <BrainCircuit className="h-4 w-4" />
              {aiStatus}
            </button>
          </div>
          <label className="block">
            <span className="text-xs font-bold uppercase text-secondary">Target</span>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="mt-2 min-h-20 w-full resize-none rounded-instrument border border-ink-border bg-background p-3 text-sm text-text-main outline-none transition focus:border-secondary focus:ring-1 focus:ring-secondary lg:min-h-28"
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
                    className="h-9 w-11 rounded-instrument border border-ink-border bg-surface p-1"
                    aria-label="Text color"
                  />
                  <button
                    type="button"
                    onClick={() => pickColor("textColor")}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-instrument border border-ink-border px-2 text-xs font-bold text-text-main transition hover:bg-surface-high"
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
                    className="h-9 w-11 rounded-instrument border border-ink-border bg-surface p-1"
                    aria-label="Box fill color"
                  />
                  <button
                    type="button"
                    onClick={() => pickColor("backgroundColor")}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-instrument border border-ink-border px-2 text-xs font-bold text-text-main transition hover:bg-surface-high"
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
                className="mt-2 w-full accent-primary"
                aria-label="Text size"
              />
            </label>
            {styleNotice ? <p className="mt-2 text-xs font-semibold text-tertiary">{styleNotice}</p> : null}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <button
              onClick={() => onSave(selectedRegion.id, { user_text: draft, render_style: styleDraft, auto_rerender: true })}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-instrument bg-primary px-3 py-2 text-sm font-bold text-white shadow-glow transition hover:bg-violet-500 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              Save
            </button>
            <button
              onClick={() => onSave(selectedRegion.id, { user_text: selectedRegion.translated_text, render_style: styleDraft, editable: false, auto_rerender: true })}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-instrument border border-ink-border px-3 py-2 text-sm font-bold text-text-main transition hover:bg-surface-high disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              Approve
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
        </div>
      ) : null}
    </aside>
  );
}
