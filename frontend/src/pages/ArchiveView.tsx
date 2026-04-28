import { Archive, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { api, queryKeys } from "../api";
import { ErrorState, LoadingState } from "../components/States";
import { StatusPill } from "../components/StatusPill";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { formatRelative } from "../lib/dates";
import { routeForProject } from "../lib/routing";

const archiveStatuses = new Set(["completed", "export_ready", "deleted"]);

export function ArchiveView() {
  const projectsQuery = useQuery({ queryKey: queryKeys.projects, queryFn: api.listProjects });
  const projects = (projectsQuery.data ?? []).filter((project) => archiveStatuses.has(project.status));

  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-white">Archive</h1>
          <p className="mt-2 text-sm text-text-muted">Completed and export-ready workspaces.</p>
        </div>

        {projectsQuery.isLoading ? <LoadingState label="Loading archive" /> : null}
        {projectsQuery.isError ? <ErrorState message={projectsQuery.error.message} /> : null}

        {!projectsQuery.isLoading && !projectsQuery.isError && projects.length === 0 ? (
          <section className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-ink-border bg-surface-low p-8 text-center">
            <div className="max-w-md">
              <Archive className="mx-auto mb-4 h-12 w-12 text-primary-soft" />
              <h2 className="font-display text-2xl font-bold text-white">Archive is empty</h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">Finished exports are listed here after a project reaches completion.</p>
            </div>
          </section>
        ) : null}

        {projects.length > 0 ? (
          <div className="space-y-3">
            {projects.map((project) => (
              <article key={project.id} className="flex flex-col gap-4 rounded-lg border border-ink-border bg-surface-low p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-lg font-bold text-white">{project.name}</h2>
                    <StatusPill status={project.status} />
                  </div>
                  <p className="text-sm text-text-muted">Updated {formatRelative(project.updated_at)}</p>
                </div>
                <Link to={routeForProject(project)} className="inline-flex items-center justify-center gap-2 rounded-instrument border border-ink-border px-4 py-2 text-sm font-bold text-text-main transition hover:bg-surface-high">
                  Open
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}
