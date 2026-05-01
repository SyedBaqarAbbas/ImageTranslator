import { Archive, Download, FileImage, FileText, Loader2, PackageCheck } from "lucide-react";
import { FormEvent, useReducer } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { api, queryKeys } from "../api";
import { ErrorState, LoadingState } from "../components/States";
import { StatusPill } from "../components/StatusPill";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { assetUrlForPage, downloadUrlForAsset } from "../lib/assets";
import { exportFailureMessage, isExportJobActive } from "../lib/exportStatus";
import type { ExportFormat } from "../types/api";

interface ExportState {
  format: ExportFormat;
  includeOriginals: boolean;
  filename: string;
  exportJobId: string | null;
  exportError: string | null;
}

const initialExportState: ExportState = {
  format: "zip",
  includeOriginals: false,
  filename: "",
  exportJobId: null,
  exportError: null,
};

function exportStateReducer(state: ExportState, patch: Partial<ExportState>): ExportState {
  return { ...state, ...patch };
}

const terminalExportStatuses = new Set(["succeeded", "partial_success", "failed", "cancelled"]);

const formatOptions = [
  {
    value: "zip",
    label: "Full ZIP",
    description: "Translated pages in a ZIP package.",
    icon: Archive,
  },
  {
    value: "pdf",
    label: "PDF",
    description: "One PDF built from rendered pages.",
    icon: FileText,
  },
  {
    value: "images",
    label: "Image ZIP",
    description: "Translated image files in one ZIP.",
    icon: FileImage,
  },
] satisfies Array<{ value: ExportFormat; label: string; description: string; icon: typeof Archive }>;

export function Export() {
  const { projectId = "" } = useParams();
  const queryClient = useQueryClient();
  const [{ format, includeOriginals, filename, exportJobId, exportError }, setExportState] = useReducer(
    exportStateReducer,
    initialExportState,
  );
  const projectQuery = useQuery({ queryKey: queryKeys.project(projectId), queryFn: () => api.getProject(projectId), enabled: Boolean(projectId) });
  const pagesQuery = useQuery({ queryKey: queryKeys.pages(projectId), queryFn: () => api.listPages(projectId), enabled: Boolean(projectId) });
  const exportQuery = useQuery({
    queryKey: exportJobId ? queryKeys.exportJob(exportJobId) : ["export-job", "empty"],
    queryFn: () => api.getExportJob(exportJobId!),
    enabled: Boolean(exportJobId),
    refetchInterval: (query) => (terminalExportStatuses.has(query.state.data?.status ?? "") ? false : 1000),
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      api.createExport(projectId, {
        format,
        include_originals: format === "pdf" ? false : includeOriginals,
        filename: filename.trim() || null,
      }),
    onMutate: () => {
      setExportState({ exportError: null });
    },
    onSuccess: async (job) => {
      setExportState({ exportJobId: job.id });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.pages(projectId) }),
      ]);
    },
    onError: (error) => {
      setExportState({ exportError: error instanceof Error ? error.message : "Unable to create export." });
    },
  });

  const project = projectQuery.data;
  const pages = pagesQuery.data ?? [];
  const coverUrl = assetUrlForPage(pages[0], "final");
  const currentExport = exportQuery.data ?? exportMutation.data;
  const isExportActive = exportMutation.isPending || isExportJobActive(currentExport?.status);
  const downloadUrl = currentExport?.status === "succeeded" ? downloadUrlForAsset(currentExport.asset) : undefined;
  const statusError = currentExport?.status === "failed" ? currentExport.error_message : null;
  const queryError = exportQuery.isError
    ? exportQuery.error instanceof Error
      ? exportQuery.error.message
      : "Unable to load export status."
    : null;
  const visibleError = exportError ?? statusError ?? queryError;
  const visibleErrorMessage = visibleError ? exportFailureMessage(visibleError, pages.length) : null;
  const submitLabel = exportMutation.isPending
    ? "Creating Export"
    : isExportJobActive(currentExport?.status)
      ? "Export Running"
      : currentExport?.status === "failed"
        ? "Retry Export"
        : currentExport?.status === "succeeded"
          ? "Generate New Export"
          : "Export Project";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isExportActive) {
      return;
    }
    setExportState({ exportError: null });
    exportMutation.mutate();
  }

  return (
    <WorkspaceShell>
      {projectQuery.isLoading || pagesQuery.isLoading ? <LoadingState label="Loading export workspace" /> : null}
      {projectQuery.isError ? <ErrorState message={projectQuery.error.message} /> : null}
      {pagesQuery.isError ? <ErrorState message={pagesQuery.error.message} /> : null}

      {project ? (
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[380px_1fr] lg:px-8">
          <section className="glass-panel rounded-lg p-5">
            <h1 className="font-display text-2xl font-bold text-white">Export Project</h1>
            <p className="mt-1 text-sm text-text-muted">{project.name}</p>
            <div className="mt-5 overflow-hidden rounded-lg border border-ink-border bg-background">
              {coverUrl ? <img src={coverUrl} alt="" className="aspect-[3/4] w-full object-cover grayscale" /> : <div className="aspect-[3/4] bg-surface-high" />}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-instrument border border-ink-border bg-background p-3">
                <p className="text-xs font-bold uppercase text-text-muted">Pages</p>
                <p className="mt-1 font-display text-2xl font-black text-white">{pages.length}</p>
              </div>
              <div className="rounded-instrument border border-ink-border bg-background p-3">
                <p className="text-xs font-bold uppercase text-text-muted">Status</p>
                <div className="mt-2"><StatusPill status={project.status} /></div>
              </div>
            </div>
            <Link to={`/projects/${projectId}/editor`} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-instrument border border-ink-border px-4 py-3 text-sm font-bold text-text-main transition hover:bg-surface-high">
              Open Editor
            </Link>
          </section>

          <form onSubmit={handleSubmit} className="glass-panel rounded-lg p-5">
            <h2 className="font-display text-2xl font-bold text-white">Format Selection</h2>
            <p className="mt-1 text-sm text-text-muted">Choose the delivery package for translated pages.</p>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {formatOptions.map(({ value, label, description, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setExportState({ format: value as ExportFormat })}
                  aria-pressed={format === value}
                  className={`rounded-lg border p-4 text-left transition ${
                    format === value ? "border-secondary bg-secondary/10 text-white shadow-cyan" : "border-ink-border bg-background text-text-muted hover:border-primary/50 hover:text-white"
                  }`}
                >
                  <Icon className="mb-4 h-6 w-6" />
                  <span className="font-display text-lg font-bold">{label}</span>
                  <span className="mt-2 block text-xs leading-5 text-text-muted">{description}</span>
                </button>
              ))}
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="text-xs font-bold uppercase text-text-muted">Filename</span>
                <input value={filename} onChange={(event) => setExportState({ filename: event.target.value })} placeholder={`${project.name}-translated`} className="mt-2 w-full rounded-instrument border border-ink-border bg-background px-3 py-3 text-sm text-text-main outline-none focus:border-secondary" />
              </label>
              {format !== "pdf" ? (
                <div className="flex items-center justify-between rounded-lg border border-ink-border bg-background p-3">
                  <span>
                    <span id="include-originals-label" className="block text-sm font-bold text-white">Include originals</span>
                    <span id="include-originals-description" className="block text-xs text-text-muted">Package source scans alongside translated output.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={includeOriginals}
                    onChange={(event) => setExportState({ includeOriginals: event.target.checked })}
                    className="h-5 w-5 rounded border-ink-border bg-surface text-primary focus:ring-primary"
                    aria-labelledby="include-originals-label"
                    aria-describedby="include-originals-description"
                  />
                </div>
              ) : null}
            </div>

            {currentExport ? (
              <div className="mt-6 rounded-lg border border-ink-border bg-background p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-bold text-white">Export job</span>
                  <StatusPill status={currentExport.status} />
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-high">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary" style={{ width: `${currentExport.progress}%` }} />
                </div>
                {downloadUrl ? (
                  <a className="mt-4 inline-flex items-center gap-2 rounded-instrument bg-primary px-4 py-2 text-sm font-bold text-white shadow-glow transition hover:bg-violet-500" href={downloadUrl} download>
                    <Download className="h-4 w-4" />
                    Download export
                  </a>
                ) : null}
              </div>
            ) : null}

            {visibleErrorMessage ? (
              <p role="alert" className="mt-4 rounded-instrument border border-danger/40 bg-danger/10 p-3 text-sm font-semibold leading-6 text-danger">
                {visibleErrorMessage}
              </p>
            ) : null}

            <button type="submit" disabled={isExportActive} className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-lg bg-primary px-6 py-4 text-sm font-bold uppercase text-white shadow-glow transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60">
              {isExportActive ? <Loader2 className="h-5 w-5 animate-spin" /> : <PackageCheck className="h-5 w-5" />}
              {submitLabel}
            </button>
          </form>
        </div>
      ) : null}
    </WorkspaceShell>
  );
}
