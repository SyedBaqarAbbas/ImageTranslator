import { Columns2, Download, Minus, Plus, RotateCcw, Save, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { api, queryKeys } from "../api";
import { CanvasWorkspace } from "../components/CanvasWorkspace";
import { RegionPanel } from "../components/RegionPanel";
import { ErrorState, LoadingState } from "../components/States";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { assetUrlForPage } from "../lib/assets";
import type { BoundingBox, TextRegionRead, TextRegionUpdate } from "../types/api";

export function Editor() {
  const { projectId = "" } = useParams();
  const queryClient = useQueryClient();
  const [selectedPageId, setSelectedPageId] = useState<string | undefined>();
  const [selectedRegionId, setSelectedRegionId] = useState<string | undefined>();
  const [mode, setMode] = useState<"original" | "translated">("translated");
  const [comparison, setComparison] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [workspaceStatus, setWorkspaceStatus] = useState("Unsaved");
  const [styleDrafts, setStyleDrafts] = useState<Record<string, Record<string, unknown>>>({});

  const projectQuery = useQuery({ queryKey: queryKeys.project(projectId), queryFn: () => api.getProject(projectId), enabled: Boolean(projectId) });
  const pagesQuery = useQuery({ queryKey: queryKeys.pages(projectId), queryFn: () => api.listPages(projectId), enabled: Boolean(projectId) });
  const pages = useMemo(() => pagesQuery.data ?? [], [pagesQuery.data]);
  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? pages[0];

  useEffect(() => {
    if (!selectedPageId && pages[0]) setSelectedPageId(pages[0].id);
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
    if (!selectedRegionId && regions[0]) setSelectedRegionId(regions[0].id);
  }, [regions, selectedRegionId]);

  const saveMutation = useMutation({
    mutationFn: ({ regionId, payload }: { regionId: string; payload: TextRegionUpdate }) => api.updateRegion(regionId, payload),
    onSuccess: async () => {
      if (selectedPage) await queryClient.invalidateQueries({ queryKey: queryKeys.regions(selectedPage.id) });
      if (projectId) await queryClient.invalidateQueries({ queryKey: queryKeys.pages(projectId) });
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
      if (selectedPage) await queryClient.invalidateQueries({ queryKey: queryKeys.regions(selectedPage.id) });
      if (projectId) await queryClient.invalidateQueries({ queryKey: queryKeys.pages(projectId) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (regionId: string) => api.deleteRegion(regionId),
    onSuccess: async () => {
      setSelectedRegionId(undefined);
      if (selectedPage) await queryClient.invalidateQueries({ queryKey: queryKeys.regions(selectedPage.id) });
      if (projectId) await queryClient.invalidateQueries({ queryKey: queryKeys.pages(projectId) });
    },
  });

  const retranslateMutation = useMutation({
    mutationFn: ({ regionId, sourceText }: { regionId: string; sourceText: string }) =>
      api.retranslateRegion(regionId, {
        source_text: sourceText,
        target_language: projectQuery.data?.target_language,
        tone: projectQuery.data?.translation_tone,
      }),
    onSuccess: async () => {
      if (selectedPage) await queryClient.invalidateQueries({ queryKey: queryKeys.regions(selectedPage.id) });
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
              <button disabled className="rounded-instrument p-2 text-text-muted opacity-45 transition hover:bg-surface-high hover:text-white disabled:cursor-not-allowed" aria-label="Undo" title="Undo history is not available in this prototype yet">
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("translated");
                  setComparison(false);
                  setZoom(1);
                  setWorkspaceStatus("View reset");
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
                  <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)} className={`rounded-instrument px-3 py-1.5 text-xs font-bold capitalize ${mode === value ? "bg-surface-high text-white" : "text-text-muted hover:text-white"}`}>
                    {value}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-pressed={comparison}
                onClick={() => setComparison((enabled) => !enabled)}
                className={`rounded-instrument p-2 transition hover:bg-surface-high hover:text-white ${comparison ? "bg-secondary/10 text-secondary" : "text-text-muted"}`}
                aria-label="Compare split"
              >
                <Columns2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={zoom <= 0.75}
                onClick={() => setZoom((value) => Math.max(0.75, Number((value - 0.15).toFixed(2))))}
                className="hidden rounded-instrument p-2 text-text-muted transition hover:bg-surface-high hover:text-white disabled:cursor-not-allowed disabled:opacity-45 sm:block"
                aria-label="Zoom out"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={zoom >= 1.45}
                onClick={() => setZoom((value) => Math.min(1.45, Number((value + 0.15).toFixed(2))))}
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
                      setSelectedPageId(page.id);
                      setSelectedRegionId(undefined);
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
              imageUrl={assetUrlForPage(selectedPage, mode === "original" ? "original" : "preview")}
              width={selectedPage.width}
              height={selectedPage.height}
              regions={displayRegions}
              selectedRegionId={selectedRegionId}
              onSelectRegion={setSelectedRegionId}
              onMoveRegion={(regionId, boundingBox) => moveMutation.mutate({ regionId, boundingBox })}
              mode={mode}
              zoom={zoom}
              comparison={comparison}
            />

            <RegionPanel
              regions={displayRegions}
              selectedRegionId={selectedRegionId}
              onSelect={setSelectedRegionId}
              onSave={(regionId, payload) => saveMutation.mutate({ regionId, payload })}
              onRetranslate={(regionId, sourceText) => retranslateMutation.mutate({ regionId, sourceText })}
              onDelete={(regionId) => deleteMutation.mutate(regionId)}
              onStyleDraftChange={(regionId, renderStyle) => {
                setWorkspaceStatus("Unsaved");
                setStyleDrafts((current) => ({ ...current, [regionId]: renderStyle }));
              }}
              isSaving={saveMutation.isPending || moveMutation.isPending}
              isDeleting={deleteMutation.isPending}
            />
          </div>

          <div className="flex h-12 shrink-0 items-center justify-between border-t border-ink-border bg-background px-4 text-xs font-semibold text-text-muted">
            <span>{regions.length} regions · Page {selectedPage.page_number}</span>
            <span className="hidden text-secondary sm:inline">{comparison ? "Compare split on" : `Zoom ${Math.round(zoom * 100)}%`} · {workspaceStatus}</span>
            <button
              onClick={() => {
                setWorkspaceStatus("Saved");
                if (selectedRegionId) saveMutation.mutate({ regionId: selectedRegionId, payload: { auto_rerender: true } });
              }}
              className="inline-flex items-center gap-2 rounded-instrument border border-ink-border px-3 py-1.5 text-text-main transition hover:bg-surface-high"
            >
              <Save className="h-3.5 w-3.5" />
              Save workspace
            </button>
          </div>
        </div>
      ) : null}
    </WorkspaceShell>
  );
}
