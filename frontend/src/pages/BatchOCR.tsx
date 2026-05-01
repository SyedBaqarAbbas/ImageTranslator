import { Loader2, Play, Search } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api, queryKeys } from "../api";
import { ErrorState, LoadingState } from "../components/States";
import { StatusPill } from "../components/StatusPill";
import { WorkspaceShell } from "../components/WorkspaceShell";
import type { ProjectRead } from "../types/api";

export function BatchOCR() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const projectsQuery = useQuery({ queryKey: queryKeys.projects, queryFn: api.listProjects });
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
  const filteredProjects = projects.filter((project) => project.name.toLowerCase().includes(search.toLowerCase()));
  const processMutation = useMutation({
    mutationFn: (project: ProjectRead) => api.processProject(project.id, { force: true }),
    onSuccess: async (_job, project) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.jobs(project.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.project(project.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
      ]);
    },
  });

  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold text-white">Batch OCR</h1>
            <p className="mt-2 text-sm text-text-muted">Queue OCR and translation processing for existing projects.</p>
          </div>
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 w-full rounded-lg border border-ink-border bg-surface px-10 text-sm text-text-main outline-none focus:border-secondary sm:w-80"
              placeholder="Search projects..."
            />
          </label>
        </div>

        {projectsQuery.isLoading ? <LoadingState label="Loading processing targets" /> : null}
        {projectsQuery.isError ? <ErrorState message={projectsQuery.error.message} /> : null}

        {!projectsQuery.isLoading && !projectsQuery.isError ? (
          <div className="space-y-3">
            {filteredProjects.map((project) => {
              const isProcessing = processMutation.isPending && processMutation.variables?.id === project.id;
              return (
                <article key={project.id} className="flex flex-col gap-4 rounded-lg border border-ink-border bg-surface-low p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-lg font-bold text-white">{project.name}</h2>
                      <StatusPill status={project.status} />
                    </div>
                    <p className="text-sm text-text-muted">
                      {project.source_language.toUpperCase()} to {project.target_language.toUpperCase()} · {project.translation_tone}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/projects/${project.id}/processing`} className="inline-flex items-center justify-center rounded-instrument border border-ink-border px-4 py-2 text-sm font-bold text-text-main transition hover:bg-surface-high">
                      Open queue
                    </Link>
                    <button
                      disabled={processMutation.isPending}
                      onClick={() => processMutation.mutate(project)}
                      className="inline-flex items-center justify-center gap-2 rounded-instrument bg-primary px-4 py-2 text-sm font-bold text-white shadow-glow transition hover:bg-violet-500 disabled:opacity-60"
                    >
                      {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      Run OCR
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}
