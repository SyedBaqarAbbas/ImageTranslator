import { Columns2, Download, Minus, Plus, RotateCcw, Save, Undo2 } from "lucide-react";
import { useEffect, useMemo, useReducer } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { api, queryKeys } from "../api";
import { CanvasWorkspace } from "../components/CanvasWorkspace";
import { RegionPanel } from "../components/RegionPanel";
import type { RegionRetranslateFeedback, RegionRetranslateSource, RegionSaveAction, RegionSaveFeedback } from "../components/RegionPanel";
import { ErrorState, LoadingState } from "../components/States";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { assetUrlForPage } from "../lib/assets";
import { waitForSuccessfulRetranslateJob } from "../lib/retranslateJob";
import type { BoundingBox, TextRegionRead, TextRegionUpdate } from "../types/api";

type EditorMode = "original" | "translated";
type EditorSaveAction = RegionSaveAction | "workspace";

interface EditorState {
  selectedPageId?: string;
  selectedRegionId?: string;
  mode: EditorMode;
  comparison: boolean;
  comparisonSplit: number;
  zoom: number;
  workspaceStatus: string;
  styleDrafts: Record<string, Record<string, unknown>>;
  regionSaveFeedback: RegionSaveFeedback | null;
  regionRetranslateFeedback: RegionRetranslateFeedback | null;
}

type EditorAction =
  | { type: "patch"; patch: Partial<EditorState> }
  | { type: "toggleComparison" }
  | { type: "setStyleDraft"; regionId: string; renderStyle: Record<string, unknown> }
  | { type: "clearStyleDraft"; regionId: string }
  | { type: "markRegionDirty"; regionId: string }
  | { type: "setRegionSaveFeedback"; feedback: RegionSaveFeedback | null }
  | { type: "setRegionRetranslateFeedback"; feedback: RegionRetranslateFeedback | null };

const ZOOM_MIN = 0.75;
const ZOOM_MAX = 1.45;
const ZOOM_STEP = 0.15;

const initialEditorState: EditorState = {
  mode: "translated",
  comparison: false,
  comparisonSplit: 50,
  zoom: 1,
  workspaceStatus: "Unsaved",
  styleDrafts: {},
  regionSaveFeedback: null,
  regionRetranslateFeedback: null,
};

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  if (action.type === "toggleComparison") {
    return { ...state, comparison: !state.comparison };
  }

  if (action.type === "setStyleDraft") {
    return {
      ...state,
      workspaceStatus: "Unsaved",
      regionSaveFeedback: state.regionSaveFeedback?.regionId === action.regionId ? null : state.regionSaveFeedback,
      regionRetranslateFeedback:
        state.regionRetranslateFeedback?.regionId === action.regionId ? null : state.regionRetranslateFeedback,
      styleDrafts: { ...state.styleDrafts, [action.regionId]: action.renderStyle },
    };
  }

  if (action.type === "clearStyleDraft") {
    const styleDrafts = { ...state.styleDrafts };
    delete styleDrafts[action.regionId];
    return { ...state, styleDrafts };
  }

  if (action.type === "markRegionDirty") {
    return {
      ...state,
      workspaceStatus: "Unsaved",
      regionSaveFeedback: state.regionSaveFeedback?.regionId === action.regionId ? null : state.regionSaveFeedback,
      regionRetranslateFeedback:
        state.regionRetranslateFeedback?.regionId === action.regionId ? null : state.regionRetranslateFeedback,
    };
  }

  if (action.type === "setRegionSaveFeedback") {
    return { ...state, regionSaveFeedback: action.feedback };
  }

  if (action.type === "setRegionRetranslateFeedback") {
    return {
      ...state,
      regionRetranslateFeedback: action.feedback,
      regionSaveFeedback:
        action.feedback && state.regionSaveFeedback?.regionId === action.feedback.regionId ? null : state.regionSaveFeedback,
    };
  }

  return { ...state, ...action.patch };
}

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(value.toFixed(2))));
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function pendingMessage(action: EditorSaveAction): string {
  return action === "approve" ? "Approving..." : "Saving...";
}

function successMessage(action: EditorSaveAction): string {
  return action === "approve" ? "Approved" : "Saved";
}

function retranslateSourceLabel(source: RegionRetranslateSource): string {
  return source === "detected_text" ? "OCR source text" : "current target draft";
}

interface SaveRegionVariables {
  regionId: string;
  payload: TextRegionUpdate;
  action: EditorSaveAction;
}

interface RetranslateRegionVariables {
  regionId: string;
  sourceText: string;
  source: RegionRetranslateSource;
}

export function Editor() {
  const { projectId = "" } = useParams();
  const queryClient = useQueryClient();
  const [
    { selectedPageId, selectedRegionId, mode, comparison, comparisonSplit, zoom, workspaceStatus, styleDrafts, regionSaveFeedback, regionRetranslateFeedback },
    dispatchEditor,
  ] = useReducer(editorReducer, initialEditorState);
  const zoomLabel = `${Math.round(zoom * 100)}%`;

  const projectQuery = useQuery({ queryKey: queryKeys.project(projectId), queryFn: () => api.getProject(projectId), enabled: Boolean(projectId) });
  const pagesQuery = useQuery({ queryKey: queryKeys.pages(projectId), queryFn: () => api.listPages(projectId), enabled: Boolean(projectId) });
  const pages = useMemo(() => pagesQuery.data ?? [], [pagesQuery.data]);
  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? pages[0];

  useEffect(() => {
    if (!selectedPageId && pages[0]) {
      dispatchEditor({ type: "patch", patch: { selectedPageId: pages[0].id } });
    }
  }, [pages, selectedPageId]);

  const regionsQuery = useQuery({
    queryKey: selectedPage ? queryKeys.regions(selectedPage.id) : ["regions", "empty"],
    queryFn: () => api.listRegions(selectedPage!.id),
    enabled: Boolean(selectedPage),
  });
  const regions = useMemo(() => regionsQuery.data ?? [], [regionsQuery.data]);
  const displayRegions = useMemo(
    () =>
      regions.map((region) => {
        const draft = styleDrafts[region.id];
        return draft ? { ...region, render_style: { ...(region.render_style ?? {}), ...draft } } : region;
      }),
    [regions, styleDrafts],
  );

  useEffect(() => {
    if (!selectedRegionId && regions[0]) {
      dispatchEditor({ type: "patch", patch: { selectedRegionId: regions[0].id } });
    }
  }, [regions, selectedRegionId]);

  const saveMutation = useMutation({
    mutationFn: ({ regionId, payload }: SaveRegionVariables) => api.updateRegion(regionId, payload),
    onMutate: ({ regionId, action }) => {
      if (action === "workspace") {
        dispatchEditor({ type: "patch", patch: { workspaceStatus: "Saving..." } });
        return;
      }
      dispatchEditor({
        type: "setRegionSaveFeedback",
        feedback: {
          regionId,
          action,
          status: "pending",
          message: pendingMessage(action),
        },
      });
      dispatchEditor({ type: "patch", patch: { workspaceStatus: "Saving..." } });
    },
    onSuccess: async (updatedRegion, variables) => {
      queryClient.setQueryData<TextRegionRead[]>(queryKeys.regions(updatedRegion.page_id), (current) =>
        current?.map((region) => (region.id === updatedRegion.id ? updatedRegion : region)) ?? current,
      );
      if (variables.payload.render_style !== undefined) {
        dispatchEditor({ type: "clearStyleDraft", regionId: updatedRegion.id });
      }
      if (variables.action === "workspace") {
        dispatchEditor({ type: "patch", patch: { workspaceStatus: "Saved" } });
      } else {
        dispatchEditor({
          type: "setRegionSaveFeedback",
          feedback: {
            regionId: updatedRegion.id,
            action: variables.action,
            status: "success",
            message: successMessage(variables.action),
          },
        });
        dispatchEditor({ type: "patch", patch: { workspaceStatus: "Saved" } });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.regions(updatedRegion.page_id) }),
        projectId ? queryClient.invalidateQueries({ queryKey: queryKeys.pages(projectId) }) : Promise.resolve(),
        projectId ? queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) }) : Promise.resolve(),
      ]);
    },
    onError: (error, variables) => {
      const message = errorMessage(error, "The request failed.");
      if (variables.action === "workspace") {
        dispatchEditor({ type: "patch", patch: { workspaceStatus: `Save failed: ${message}` } });
        return;
      }
      dispatchEditor({
        type: "setRegionSaveFeedback",
        feedback: {
          regionId: variables.regionId,
          action: variables.action,
          status: "error",
          message: `${variables.action === "approve" ? "Approve" : "Save"} failed: ${message}`,
        },
      });
      dispatchEditor({ type: "patch", patch: { workspaceStatus: "Unsaved" } });
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ regionId, boundingBox }: { regionId: string; boundingBox: BoundingBox }) =>
      api.updateRegion(regionId, { bounding_box: boundingBox, auto_rerender: true }),
    onMutate: async ({ regionId, boundingBox }) => {
      if (!selectedPage) {
        return undefined;
      }
      const key = queryKeys.regions(selectedPage.id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TextRegionRead[]>(key);
      queryClient.setQueryData<TextRegionRead[]>(
        key,
        (current) => current?.map((region) => (region.id === regionId ? { ...region, bounding_box: boundingBox } : region)) ?? current,
      );
      return { key, previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },
    onSettled: async () => {
      await Promise.all([
        selectedPage ? queryClient.invalidateQueries({ queryKey: queryKeys.regions(selectedPage.id) }) : Promise.resolve(),
        projectId ? queryClient.invalidateQueries({ queryKey: queryKeys.pages(projectId) }) : Promise.resolve(),
      ]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (regionId: string) => api.deleteRegion(regionId),
    onSuccess: async () => {
      dispatchEditor({ type: "patch", patch: { selectedRegionId: undefined } });
      await Promise.all([
        selectedPage ? queryClient.invalidateQueries({ queryKey: queryKeys.regions(selectedPage.id) }) : Promise.resolve(),
        projectId ? queryClient.invalidateQueries({ queryKey: queryKeys.pages(projectId) }) : Promise.resolve(),
      ]);
    },
  });

  const retranslateMutation = useMutation({
    mutationFn: async ({ regionId, sourceText }: RetranslateRegionVariables) => {
      const job = await api.retranslateRegion(regionId, {
        source_text: sourceText,
        target_language: projectQuery.data?.target_language,
        tone: projectQuery.data?.translation_tone,
      });
      return waitForSuccessfulRetranslateJob(job, { getProcessingJob: api.getProcessingJob });
    },
    onMutate: ({ regionId, source }) => {
      dispatchEditor({
        type: "setRegionRetranslateFeedback",
        feedback: {
          regionId,
          status: "pending",
          message: `Translating from ${retranslateSourceLabel(source)}.`,
        },
      });
      dispatchEditor({ type: "patch", patch: { workspaceStatus: "Translating region..." } });
    },
    onSuccess: async (job, variables) => {
      const pageId = job.page_id ?? selectedPage?.id;
      await Promise.all([
        pageId ? queryClient.invalidateQueries({ queryKey: queryKeys.regions(pageId) }) : Promise.resolve(),
        projectId ? queryClient.invalidateQueries({ queryKey: queryKeys.jobs(projectId) }) : Promise.resolve(),
        projectId ? queryClient.invalidateQueries({ queryKey: queryKeys.pages(projectId) }) : Promise.resolve(),
        projectId ? queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) }) : Promise.resolve(),
      ]);
      dispatchEditor({
        type: "setRegionRetranslateFeedback",
        feedback: {
          regionId: variables.regionId,
          status: "success",
          message: "Translation updated.",
        },
      });
      dispatchEditor({ type: "patch", patch: { workspaceStatus: "Translation updated" } });
    },
    onError: (error, variables) => {
      dispatchEditor({
        type: "setRegionRetranslateFeedback",
        feedback: {
          regionId: variables.regionId,
          status: "error",
          message: `Translation failed: ${errorMessage(error, "The request failed.")}`,
        },
      });
      dispatchEditor({ type: "patch", patch: { workspaceStatus: "Translation failed" } });
    },
  });

  return (
    <WorkspaceShell fullHeight>
      {projectQuery.isLoading || pagesQuery.isLoading ? <LoadingState label="Loading editor" /> : null}
      {projectQuery.isError ? <ErrorState message={projectQuery.error.message} /> : null}
      {pagesQuery.isError ? <ErrorState message={pagesQuery.error.message} /> : null}

      {projectQuery.data && selectedPage ? (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-ink-border bg-surface-low px-3 md:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="group relative inline-flex">
                <button
                  type="button"
                  aria-disabled="true"
                  aria-describedby="undo-coming-soon"
                  onClick={(event) => event.preventDefault()}
                  className="rounded-instrument p-2 text-text-muted opacity-45 transition hover:bg-surface-high hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
                  aria-label="Undo"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <span
                  id="undo-coming-soon"
                  role="tooltip"
                  className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-48 rounded-instrument border border-ink-border bg-background px-3 py-2 text-xs font-semibold text-text-main opacity-0 shadow-2xl transition group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  Coming soon: undo history is not available yet.
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  dispatchEditor({ type: "patch", patch: { mode: "translated", comparison: false, zoom: 1, workspaceStatus: "View reset" } });
                }}
                className="rounded-instrument p-2 text-text-muted transition hover:bg-surface-high hover:text-white"
                aria-label="Reset view"
                title="Reset view"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <span className="hidden h-5 w-px bg-ink-border sm:block" />
              <h1 className="truncate font-display text-base font-bold text-white">{projectQuery.data.name}</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden rounded-instrument border border-ink-border bg-background p-1 sm:flex">
                {(["original", "translated"] as const).map((value) => (
                  <button key={value} aria-pressed={mode === value} onClick={() => dispatchEditor({ type: "patch", patch: { mode: value } })} className={`rounded-instrument px-3 py-1.5 text-xs font-bold capitalize ${mode === value ? "bg-surface-high text-white" : "text-text-muted hover:text-white"}`}>
                    {value}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-pressed={comparison}
                onClick={() => dispatchEditor({ type: "toggleComparison" })}
                className={`rounded-instrument p-2 transition hover:bg-surface-high hover:text-white ${comparison ? "bg-secondary/10 text-secondary" : "text-text-muted"}`}
                aria-label="Compare split"
              >
                <Columns2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={zoom <= ZOOM_MIN}
                onClick={() => dispatchEditor({ type: "patch", patch: { zoom: clampZoom(zoom - ZOOM_STEP) } })}
                className="hidden rounded-instrument p-2 text-text-muted transition hover:bg-surface-high hover:text-white disabled:cursor-not-allowed disabled:opacity-45 sm:block"
                aria-label="Zoom out"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="hidden w-12 shrink-0 text-center text-xs font-bold tabular-nums text-secondary sm:inline-block">{zoomLabel}</span>
              <button
                type="button"
                disabled={zoom >= ZOOM_MAX}
                onClick={() => dispatchEditor({ type: "patch", patch: { zoom: clampZoom(zoom + ZOOM_STEP) } })}
                className="hidden rounded-instrument p-2 text-text-muted transition hover:bg-surface-high hover:text-white disabled:cursor-not-allowed disabled:opacity-45 sm:block"
                aria-label="Zoom in"
              >
                <Plus className="h-4 w-4" />
              </button>
              <Link to={`/projects/${projectId}/export`} className="inline-flex items-center gap-2 rounded-instrument bg-primary px-3 py-2 text-sm font-bold text-white shadow-glow transition hover:bg-violet-500">
                <Download className="h-4 w-4" />
                Export
              </Link>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <aside className="hidden w-28 shrink-0 overflow-y-auto border-r border-ink-border bg-surface-low p-3 lg:block">
              <div className="space-y-3">
                {pages.map((page) => (
                  <button
                    key={page.id}
                    onClick={() => {
                      dispatchEditor({ type: "patch", patch: { selectedPageId: page.id, selectedRegionId: undefined } });
                    }}
                    disabled={selectedPage.id === page.id}
                    aria-current={selectedPage.id === page.id ? "true" : undefined}
                    className={`w-full rounded-instrument border p-1 transition disabled:cursor-default ${selectedPage.id === page.id ? "border-secondary bg-secondary/10" : "border-ink-border bg-background hover:border-primary/50"}`}
                  >
                    {assetUrlForPage(page) ? <img src={assetUrlForPage(page)} alt={`Page ${page.page_number}`} className="aspect-[3/4] w-full rounded-[2px] object-cover grayscale" /> : null}
                    <span className="mt-1 block text-xs font-bold text-text-muted">P{page.page_number}</span>
                  </button>
                ))}
              </div>
            </aside>

            <CanvasWorkspace
              imageUrl={assetUrlForPage(selectedPage, mode === "original" ? "original" : "editable")}
              comparisonOriginalImageUrl={assetUrlForPage(selectedPage, "original")}
              comparisonTranslatedImageUrl={assetUrlForPage(selectedPage, "final")}
              comparisonSplit={comparisonSplit}
              onComparisonSplitChange={(split) => dispatchEditor({ type: "patch", patch: { comparisonSplit: split } })}
              width={selectedPage.width}
              height={selectedPage.height}
              regions={displayRegions}
              selectedRegionId={selectedRegionId}
              onSelectRegion={(regionId) => dispatchEditor({ type: "patch", patch: { selectedRegionId: regionId } })}
              onMoveRegion={(regionId, boundingBox) => moveMutation.mutate({ regionId, boundingBox })}
              mode={mode}
              zoom={zoom}
              comparison={comparison}
            />

            <RegionPanel
              regions={displayRegions}
              selectedRegionId={selectedRegionId}
              onSelect={(regionId) => dispatchEditor({ type: "patch", patch: { selectedRegionId: regionId } })}
              onSave={(regionId, payload, action) => saveMutation.mutate({ regionId, payload, action })}
              onRetranslate={(regionId, sourceText, source) => retranslateMutation.mutate({ regionId, sourceText, source })}
              onDelete={(regionId) => deleteMutation.mutate(regionId)}
              onDraftChange={(regionId) => dispatchEditor({ type: "markRegionDirty", regionId })}
              onStyleDraftChange={(regionId, renderStyle) => {
                dispatchEditor({ type: "setStyleDraft", regionId, renderStyle });
              }}
              saveFeedback={regionSaveFeedback}
              retranslateFeedback={regionRetranslateFeedback}
              isDeleting={deleteMutation.isPending}
            />
          </div>

          <div className="flex h-12 shrink-0 items-center justify-between border-t border-ink-border bg-background px-4 text-xs font-semibold text-text-muted">
            <span>{regions.length} regions · Page {selectedPage.page_number}</span>
            <span className="hidden text-secondary sm:inline">Zoom {zoomLabel}{comparison ? " · Compare split on" : ""} · {workspaceStatus}</span>
            <button
              type="button"
              disabled={!selectedRegionId || saveMutation.isPending}
              onClick={() => {
                if (selectedRegionId) {
                  saveMutation.mutate({ regionId: selectedRegionId, payload: { auto_rerender: true }, action: "workspace" });
                }
              }}
              className="inline-flex items-center gap-2 rounded-instrument border border-ink-border px-3 py-1.5 text-text-main transition hover:bg-surface-high disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              {saveMutation.isPending && saveMutation.variables?.action === "workspace" ? "Saving" : "Save workspace"}
            </button>
          </div>
        </div>
      ) : null}
    </WorkspaceShell>
  );
}
