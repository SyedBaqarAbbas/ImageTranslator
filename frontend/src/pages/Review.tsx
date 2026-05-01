import { Check, ExternalLink, PenLine, RefreshCw } from "lucide-react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { api, queryKeys } from "../api";
import { ErrorState, LoadingState } from "../components/States";
import { StatusPill } from "../components/StatusPill";
import { WorkspaceShell } from "../components/WorkspaceShell";
import type { TextRegionRead } from "../types/api";

function needsReview(region: TextRegionRead): boolean {
  return (
    region.status === "needs_review" ||
    region.status === "ocr_low_confidence" ||
    region.status === "failed" ||
    !region.translated_text ||
    (region.ocr_confidence ?? 1) < 0.8 ||
    (region.translation_confidence ?? 1) < 0.75
  );
}

export function Review() {
  const { projectId = "" } = useParams();
  const queryClient = useQueryClient();
  const projectQuery = useQuery({ queryKey: queryKeys.project(projectId), queryFn: () => api.getProject(projectId), enabled: Boolean(projectId) });
  const pagesQuery = useQuery({ queryKey: queryKeys.pages(projectId), queryFn: () => api.listPages(projectId), enabled: Boolean(projectId) });
  const pages = pagesQuery.data ?? [];
  const regionQueries = useQueries({
    queries: pages.map((page) => ({
      queryKey: queryKeys.regions(page.id),
      queryFn: () => api.listRegions(page.id),
      enabled: pages.length > 0,
    })),
  });
  const reviewRegions = regionQueries.reduce<TextRegionRead[]>((matches, query) => {
    for (const region of query.data ?? []) {
      if (needsReview(region)) {
        matches.push(region);
      }
    }
    return matches;
  }, []);

  const approveMutation = useMutation({
    mutationFn: (region: TextRegionRead) =>
      api.updateRegion(region.id, {
        user_text: region.user_text || region.translated_text || "",
        editable: false,
        auto_rerender: true,
      }),
    onSuccess: async (region) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.regions(region.page_id) });
    },
  });

  return (
    <WorkspaceShell>
      {projectQuery.isLoading || pagesQuery.isLoading ? <LoadingState label="Loading review queue" /> : null}
      {projectQuery.isError ? <ErrorState message={projectQuery.error.message} /> : null}
      {pagesQuery.isError ? <ErrorState message={pagesQuery.error.message} /> : null}

      {projectQuery.data ? (
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase text-secondary">Quality Review Mode</p>
              <h1 className="mt-2 font-display text-3xl font-bold text-white">{projectQuery.data.name}</h1>
              <p className="mt-2 text-sm text-text-muted">Approve low-confidence OCR and translation regions before export.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to={`/projects/${projectId}/editor`} className="inline-flex items-center gap-2 rounded-instrument border border-ink-border px-4 py-2 text-sm font-bold text-text-main transition hover:bg-surface-high">
                <PenLine className="h-4 w-4" />
                Open Editor
              </Link>
              <Link to={`/projects/${projectId}/export`} className="inline-flex items-center gap-2 rounded-instrument bg-primary px-4 py-2 text-sm font-bold text-white shadow-glow transition hover:bg-violet-500">
                Export Project
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="mb-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-ink-border bg-surface-low p-4">
              <p className="text-xs font-bold uppercase text-text-muted">Pages</p>
              <p className="mt-2 font-display text-3xl font-black text-white">{pages.length}</p>
            </div>
            <div className="rounded-lg border border-ink-border bg-surface-low p-4">
              <p className="text-xs font-bold uppercase text-text-muted">Flagged Regions</p>
              <p className="mt-2 font-display text-3xl font-black text-tertiary">{reviewRegions.length}</p>
            </div>
            <div className="rounded-lg border border-ink-border bg-surface-low p-4">
              <p className="text-xs font-bold uppercase text-text-muted">Status</p>
              <div className="mt-3"><StatusPill status={projectQuery.data.status} /></div>
            </div>
          </div>

          {reviewRegions.length === 0 ? (
            <section className="rounded-lg border border-ink-border bg-surface-low p-10 text-center">
              <Check className="mx-auto mb-4 h-12 w-12 text-emerald-300" />
              <h2 className="font-display text-2xl font-bold text-white">Review queue is clear</h2>
              <p className="mt-2 text-sm text-text-muted">All currently detected regions meet the review threshold.</p>
            </section>
          ) : (
            <div className="space-y-4">
              {reviewRegions.map((region) => {
                const page = pages.find((item) => item.id === region.page_id);
                return (
                  <article key={region.id} className="grid gap-4 rounded-lg border border-ink-border bg-surface-low p-4 md:grid-cols-[180px_1fr_auto] md:items-center">
                    <div className="rounded-lg border border-ink-border bg-background p-4">
                      <p className="text-xs font-bold uppercase text-text-muted">Page {page?.page_number ?? "?"}</p>
                      <p className="mt-2 text-sm text-text-main">{region.detected_text || "No OCR text"}</p>
                    </div>
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <StatusPill status={region.status} />
                        <span className="text-xs font-bold uppercase text-text-muted">
                          OCR {Math.round((region.ocr_confidence ?? 0) * 100)}% · Translation {Math.round((region.translation_confidence ?? 0) * 100)}%
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-white">{region.user_text || region.translated_text || "Missing translation"}</p>
                      <p className="mt-2 text-xs text-text-muted">
                        Box {region.bounding_box.x}, {region.bounding_box.y}, {region.bounding_box.width}x{region.bounding_box.height}
                      </p>
                    </div>
                    <div className="flex gap-2 md:flex-col">
                      <button
                        onClick={() => approveMutation.mutate(region)}
                        disabled={approveMutation.isPending}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-instrument bg-primary px-4 py-2 text-sm font-bold text-white shadow-glow transition hover:bg-violet-500 disabled:opacity-60"
                      >
                        <Check className="h-4 w-4" />
                        Approve
                      </button>
                      <Link to={`/projects/${projectId}/editor`} className="inline-flex flex-1 items-center justify-center gap-2 rounded-instrument border border-ink-border px-4 py-2 text-sm font-bold text-text-main transition hover:bg-surface-high">
                        <RefreshCw className="h-4 w-4" />
                        Edit
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </WorkspaceShell>
  );
}
