import { ArrowRight, Loader2, Play, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api, queryKeys } from "../api";
import { ProgressTimeline } from "../components/ProgressTimeline";
import { ErrorState, LoadingState } from "../components/States";
import { StatusPill } from "../components/StatusPill";
import { WorkspaceShell } from "../components/WorkspaceShell";

export function Processing() {
  const { projectId = "" } = useParams();
  const queryClient = useQueryClient();
  const [cancelStatus, setCancelStatus] = useState<string | null>(null);
  const projectQuery = useQuery({ queryKey: queryKeys.project(projectId), queryFn: () => api.getProject(projectId), enabled: Boolean(projectId), refetchInterval: 1500 });
  const pagesQuery = useQuery({ queryKey: queryKeys.pages(projectId), queryFn: () => api.listPages(projectId), enabled: Boolean(projectId), refetchInterval: 1500 });
  const jobsQuery = useQuery({ queryKey: queryKeys.jobs(projectId), queryFn: () => api.getProcessingJobs(projectId), enabled: Boolean(projectId), refetchInterval: 1500 });

  const processMutation = useMutation({
    mutationFn: () => api.processProject(projectId, { force: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.jobs(projectId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
    },
  });

  const latestJob = jobsQuery.data?.[0];
  const pages = pagesQuery.data ?? [];
  const pageAverage = pages.length ? Math.round(pages.reduce((sum, page) => sum + page.progress, 0) / pages.length) : 0;
  const progress = latestJob?.progress ?? pageAverage;
  const project = projectQuery.data;
  const done = project?.status === "review_required" || project?.status === "completed" || latestJob?.status === "succeeded";
  const failed = project?.status === "failed" || latestJob?.status === "failed";

  return (
    <WorkspaceShell>
      {projectQuery.isLoading ? <LoadingState label="Loading processing workspace" /> : null}
      {projectQuery.isError ? <ErrorState message={projectQuery.error.message} /> : null}
      {project ? (
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
          <section className="glass-panel overflow-hidden rounded-lg">
            <div className="ai-progress h-1 bg-surface-high" />
            <div className="p-6 sm:p-8">
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-secondary">Processing Workspace</p>
                  <h1 className="mt-2 font-display text-3xl font-black text-white">{project.name}</h1>
                  <p className="mt-2 text-sm text-text-muted">{latestJob?.stage ?? "Waiting for processing job"}</p>
                </div>
                <StatusPill status={project.status} />
              </div>

              <div className="mb-8 rounded-lg border border-ink-border bg-background p-5">
                <div className="mb-3 flex items-end justify-between">
                  <span className="text-sm font-bold text-white">Overall Progress</span>
                  <span className="font-display text-3xl font-black text-secondary">{progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-high">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
                </div>
              </div>

              <ProgressTimeline progress={progress} failed={failed} />

              <div className="mt-8 flex flex-wrap gap-3">
                {done ? (
                  <Link to={`/projects/${projectId}/review`} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-violet-500">
                    Review flagged regions
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <button disabled={processMutation.isPending} onClick={() => processMutation.mutate()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-violet-500 disabled:opacity-60">
                    {processMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Rerun processing
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCancelStatus("Cancellation requested. This prototype cannot interrupt an already completed eager job.")}
                  className="inline-flex items-center gap-2 rounded-lg border border-ink-border px-5 py-3 text-sm font-bold text-text-main transition hover:bg-surface-high"
                >
                  <X className="h-4 w-4" />
                  Cancel Processing
                </button>
              </div>
              {cancelStatus ? (
                <p className="mt-4 rounded-instrument border border-tertiary/40 bg-tertiary/10 p-3 text-sm font-semibold text-tertiary">
                  {cancelStatus}
                </p>
              ) : null}
            </div>
          </section>

          <aside className="glass-panel rounded-lg p-5">
            <h2 className="font-display text-lg font-bold text-white">Page queue</h2>
            <div className="mt-4 space-y-3">
              {pages.map((page) => (
                <div key={page.id} className="rounded-lg border border-ink-border bg-background p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-white">Page {page.page_number}</span>
                    <span className="text-xs font-bold text-text-muted">{page.progress}%</span>
                  </div>
                  <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-surface-high">
                    <div className="h-full rounded-full bg-secondary" style={{ width: `${page.progress}%` }} />
                  </div>
                  <StatusPill status={page.status} />
                </div>
              ))}
            </div>
          </aside>
        </div>
      ) : null}
    </WorkspaceShell>
  );
}
