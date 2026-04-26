import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, Save, Sparkles } from "lucide-react";

import { statusLabel } from "../lib/routing";
import type { TextRegionRead, TextRegionUpdate } from "../types/api";
import { StatusPill } from "./StatusPill";

export function RegionPanel({
  regions,
  selectedRegionId,
  onSelect,
  onSave,
  onRetranslate,
  isSaving = false,
}: {
  regions: TextRegionRead[];
  selectedRegionId?: string;
  onSelect: (regionId: string) => void;
  onSave: (regionId: string, payload: TextRegionUpdate) => void;
  onRetranslate: (regionId: string, sourceText: string) => void;
  isSaving?: boolean;
}) {
  const selectedRegion = useMemo(
    () => regions.find((region) => region.id === selectedRegionId) ?? regions[0],
    [regions, selectedRegionId],
  );
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setDraft(selectedRegion?.user_text || selectedRegion?.translated_text || "");
  }, [selectedRegion?.id, selectedRegion?.translated_text, selectedRegion?.user_text]);

  return (
    <aside className="flex min-h-0 w-full flex-col border-l border-ink-border bg-surface-low md:w-[360px]">
      <div className="border-b border-ink-border p-4">
        <p className="text-xs font-bold uppercase text-secondary">Translation Cards</p>
        <h2 className="mt-1 font-display text-lg font-bold text-white">{regions.length} detected regions</h2>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {regions.map((region) => (
            <button
              key={region.id}
              type="button"
              onClick={() => onSelect(region.id)}
              className={`w-full rounded-lg border p-3 text-left transition ${
                region.id === selectedRegion?.id ? "border-secondary bg-secondary/10" : "border-ink-border bg-surface hover:border-primary/50"
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase text-text-muted">
                  #{region.region_index} {statusLabel(region.region_type)}
                </span>
                <StatusPill status={region.status} />
              </div>
              <p className="line-clamp-2 text-sm text-text-main">{region.user_text || region.translated_text || "Untranslated"}</p>
              <p className="mt-2 text-xs text-text-muted">
                OCR {Math.round((region.ocr_confidence ?? 0) * 100)}% · Translation {Math.round((region.translation_confidence ?? 0) * 100)}%
              </p>
            </button>
          ))}
        </div>
      </div>

      {selectedRegion ? (
        <div className="border-t border-ink-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-text-muted">Source</p>
              <p className="mt-1 text-sm text-text-main">{selectedRegion.detected_text || "No OCR text"}</p>
            </div>
            <button
              onClick={() => onRetranslate(selectedRegion.id, selectedRegion.detected_text || draft)}
              className="inline-flex items-center gap-2 rounded-instrument border border-primary/40 px-3 py-2 text-xs font-bold text-primary-soft transition hover:bg-primary/10"
            >
              <BrainCircuit className="h-4 w-4" />
              AI
            </button>
          </div>
          <label className="block">
            <span className="text-xs font-bold uppercase text-secondary">Target</span>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="mt-2 min-h-28 w-full resize-none rounded-instrument border border-ink-border bg-background p-3 text-sm text-text-main outline-none transition focus:border-secondary focus:ring-1 focus:ring-secondary"
            />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              onClick={() => onSave(selectedRegion.id, { user_text: draft, auto_rerender: true })}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-instrument bg-primary px-3 py-2 text-sm font-bold text-white shadow-glow transition hover:bg-violet-500 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              Save
            </button>
            <button
              onClick={() => onSave(selectedRegion.id, { user_text: selectedRegion.translated_text, editable: false, auto_rerender: true })}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-instrument border border-ink-border px-3 py-2 text-sm font-bold text-text-main transition hover:bg-surface-high disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              Approve
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
