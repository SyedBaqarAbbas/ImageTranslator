import { ExternalLink, FileImage, Search } from "lucide-react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api, queryKeys } from "../api";
import { ErrorState, LoadingState } from "../components/States";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { assetUrlForPage } from "../lib/assets";

export function Assets() {
  const [search, setSearch] = useState("");
  const projectsQuery = useQuery({ queryKey: queryKeys.projects, queryFn: api.listProjects });
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
  const pageQueries = useQueries({
    queries: projects.map((project) => ({
      queryKey: queryKeys.pages(project.id),
      queryFn: () => api.listPages(project.id),
      enabled: projects.length > 0,
    })),
  });

  const assets = projects.flatMap((project, projectIndex) =>
    (pageQueries[projectIndex]?.data ?? []).map((page) => ({
      project,
      page,
      imageUrl: assetUrlForPage(page, "preview") ?? assetUrlForPage(page, "original"),
    })),
  );
  const filteredAssets = assets.filter(({ project, page }) =>
    `${project.name} page ${page.page_number}`.toLowerCase().includes(search.toLowerCase()),
  );
  const isLoading = projectsQuery.isLoading || pageQueries.some((query) => query.isLoading);
  const firstPageError = pageQueries.find((query) => query.isError)?.error;

  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold text-white">Assets</h1>
            <p className="mt-2 text-sm text-text-muted">Uploaded and generated page assets across active workspaces.</p>
          </div>
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 w-full rounded-lg border border-ink-border bg-surface px-10 text-sm text-text-main outline-none focus:border-secondary sm:w-80"
              placeholder="Search assets..."
            />
          </label>
        </div>

        {isLoading ? <LoadingState label="Loading assets" /> : null}
        {projectsQuery.isError ? <ErrorState message={projectsQuery.error.message} /> : null}
        {firstPageError ? <ErrorState message={firstPageError.message} /> : null}

        {!isLoading && !projectsQuery.isError && !firstPageError && filteredAssets.length === 0 ? (
          <section className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-ink-border bg-surface-low p-8 text-center">
            <div className="max-w-md">
              <FileImage className="mx-auto mb-4 h-12 w-12 text-primary-soft" />
              <h2 className="font-display text-2xl font-bold text-white">No assets found</h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">Assets appear after pages are uploaded to a project.</p>
            </div>
          </section>
        ) : null}

        {filteredAssets.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredAssets.map(({ project, page, imageUrl }) => (
              <article key={page.id} className="overflow-hidden rounded-lg border border-ink-border bg-surface-low">
                <div className="aspect-[3/4] border-b border-ink-border bg-background">
                  {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover grayscale" /> : <div className="flex h-full items-center justify-center text-primary-soft"><FileImage className="h-10 w-10" /></div>}
                </div>
                <div className="p-4">
                  <p className="text-xs font-bold uppercase text-text-muted">Page {page.page_number}</p>
                  <h2 className="mt-1 truncate font-display text-lg font-bold text-white">{project.name}</h2>
                  <Link to={`/projects/${project.id}/editor`} className="mt-4 inline-flex items-center gap-2 rounded-instrument px-2 py-1.5 text-sm font-bold text-primary-soft transition hover:bg-primary/10">
                    Open editor
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}
