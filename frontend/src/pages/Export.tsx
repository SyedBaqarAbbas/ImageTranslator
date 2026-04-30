import { Archive, Download, FileImage, FileText, Loader2, PackageCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { api, queryKeys } from "../api";
import { ErrorState, LoadingState } from "../components/States";
import { StatusPill } from "../components/StatusPill";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { assetUrlForPage, downloadUrlForAsset } from "../lib/assets";
import type { ExportFormat } from "../types/api";

export function Export() {
  const { projectId = "" } = useParams();
  const queryClient = useQueryClient();
  const [format, setFormat] = useState<ExportFormat>("zip");
  const [includeOriginals, setIncludeOriginals] = useState(false);
  const [filename, setFilename] = useState("");
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const projectQuery = useQuery({ queryKey: queryKeys.project(projectId), queryFn: () => api.getProject(projectId), enabled: Boolean(projectId) });
  const pagesQuery = useQuery({ queryKey: queryKeys.pages(projectId), queryFn: () => api.listPages(projectId), enabled: Boolean(projectId) });
  const exportQuery = useQuery({
    queryKey: exportJobId ? queryKeys.exportJob(exportJobId) : ["export-job", "empty"],
    queryFn: () => api.getExportJob(exportJobId!),
    enabled: Boolean(exportJobId),
    refetchInterval: (query) => (query.state.data?.status === "succeeded" || query.state.data?.status === "failed" ? false : 1000),
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      api.createExport(projectId, {
        format,
        include_originals: includeOriginals,
        filename: filename.trim() || null,
      }),
    onMutate: () => {
      setExportError(null);
    },
    onSuccess: async (job) => {
      setExportJobId(job.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.pages(projectId) });
    },
    onError: (error) => {
      setExportError(error instanceof Error ? error.message : "Unable to create export.");
    },
  });

  const project = projectQuery.data;
  const pages = pagesQuery.data ?? [];
  const coverUrl = assetUrlForPage(pages[0], "final");
  const currentExport = exportQuery.data ?? exportMutation.data;
  const downloadUrl = downloadUrlForAsset(currentExport?.asset);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setExportError(null);
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
              {[
                { value: "zip", label: "Full ZIP", icon: Archive },
                { value: "pdf", label: "PDF", icon: FileText },
                { value: "images", label: "Images", icon: FileImage },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormat(value as ExportFormat)}
                  aria-pressed={format === value}
                  className={`rounded-lg border p-4 text-left transition ${
                    format === value ? "border-secondary bg-secondary/10 text-white shadow-cyan" : "border-ink-border bg-background text-text-muted hover:border-primary/50 hover:text-white"
                  }`}
                >
                  <Icon className="mb-4 h-6 w-6" />
                  <span className="font-display text-lg font-bold">{label}</span>
                </button>
              ))}
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="text-xs font-bold uppercase text-text-muted">Filename</span>
                <input value={filename} onChange={(event) => setFilename(event.target.value)} placeholder={`${project.name}-translated`} className="mt-2 w-full rounded-instrument border border-ink-border bg-background px-3 py-3 text-sm text-text-main outline-none focus:border-secondary" />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-ink-border bg-background p-3">
                <span>
                  <span className="block text-sm font-bold text-white">Include originals</span>
                  <span className="block text-xs text-text-muted">Package source scans alongside translated output.</span>
                </span>
                <input type="checkbox" checked={includeOriginals} onChange={(event) => setIncludeOriginals(event.target.checked)} className="h-5 w-5 rounded border-ink-border bg-surface text-primary focus:ring-primary" />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-ink-border bg-background p-3">
                <span>
                  <span className="block text-sm font-bold text-white">High quality resampling</span>
                  <span className="block text-xs text-text-muted">Preserve output quality for final release builds.</span>
                </span>
                <input type="checkbox" defaultChecked className="h-5 w-5 rounded border-ink-border bg-surface text-primary focus:ring-primary" />
              </label>
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

            {exportError || exportQuery.isError ? (
              <p className="mt-4 rounded-instrument border border-danger/40 bg-danger/10 p-3 text-sm font-semibold text-danger">
                {exportError ?? (exportQuery.error instanceof Error ? exportQuery.error.message : "Unable to load export status.")}
              </p>
            ) : null}

            <button type="submit" disabled={exportMutation.isPending} className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-lg bg-primary px-6 py-4 text-sm font-bold uppercase text-white shadow-glow transition hover:bg-violet-500 disabled:opacity-60">
              {exportMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <PackageCheck className="h-5 w-5" />}
              {exportMutation.isPending ? "Creating Export" : currentExport?.status === "succeeded" ? "Generate New Export" : "Export Project"}
            </button>
          </form>
        </div>
      ) : null}
    </WorkspaceShell>
  );
}
