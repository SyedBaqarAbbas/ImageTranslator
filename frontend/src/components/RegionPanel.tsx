import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, Save, Sparkles, Trash2 } from "lucide-react";

import { statusLabel } from "../lib/routing";
import type { TextRegionRead, TextRegionUpdate } from "../types/api";
import { StatusPill } from "./StatusPill";

export function RegionPanel({
  regions,
  selectedRegionId,
  onSelect,
  onSave,
  onRetranslate,
  onDelete,
  isSaving = false,
  isDeleting = false,
}: {
  regions: TextRegionRead[];
  selectedRegionId?: string;
  onSelect: (regionId: string) => void;
  onSave: (regionId: string, payload: TextRegionUpdate) => void;
  onRetranslate: (regionId: string, sourceText: string) => void;
  onDelete: (regionId: string) => void;
  isSaving?: boolean;
  isDeleting?: boolean;
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
              <button type="button" onClick={() => onSelect(region.id)} className="w-full text-left">
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
              className="mt-2 min-h-20 w-full resize-none rounded-instrument border border-ink-border bg-background p-3 text-sm text-text-main outline-none transition focus:border-secondary focus:ring-1 focus:ring-secondary lg:min-h-28"
            />
          </label>
          <div className="mt-3 grid grid-cols-3 gap-3">
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
