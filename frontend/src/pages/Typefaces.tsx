import { Check, Loader2, Type } from "lucide-react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { api, queryKeys } from "../api";
import { ErrorState, LoadingState } from "../components/States";
import { WorkspaceShell } from "../components/WorkspaceShell";

const fontOptions = ["Anime Ace", "Komika", "Inter", "Noto Sans", "Merriweather"];

export function Typefaces() {
  const queryClient = useQueryClient();
  const projectsQuery = useQuery({ queryKey: queryKeys.projects, queryFn: api.listProjects });
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
  const detailQueries = useQueries({
    queries: projects.map((project) => ({
      queryKey: queryKeys.project(project.id),
      queryFn: () => api.getProject(project.id),
      enabled: projects.length > 0,
    })),
  });
  const updateMutation = useMutation({
    mutationFn: ({ projectId, font }: { projectId: string; font: string }) => api.updateSettings(projectId, { font_family: font }),
    onSuccess: async (_settings, variables) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.projectId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
  const isLoading = projectsQuery.isLoading || detailQueries.some((query) => query.isLoading);
  const detailError = detailQueries.find((query) => query.isError)?.error;

  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-white">Typefaces</h1>
          <p className="mt-2 text-sm text-text-muted">Project lettering presets used during replacement and rendering.</p>
        </div>

        {isLoading ? <LoadingState label="Loading typeface settings" /> : null}
        {projectsQuery.isError ? <ErrorState message={projectsQuery.error.message} /> : null}
        {detailError ? <ErrorState message={detailError.message} /> : null}

        {!isLoading && !projectsQuery.isError && !detailError ? (
          <div className="space-y-4">
            {projects.map((project, index) => {
              const detail = detailQueries[index]?.data;
              const selectedFont = detail?.settings?.font_family ?? "Anime Ace";
              const savingProject = updateMutation.isPending && updateMutation.variables?.projectId === project.id;
              return (
                <article key={project.id} className="rounded-lg border border-ink-border bg-surface-low p-5">
                  <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="font-display text-xl font-bold text-white">{project.name}</h2>
                      <p className="mt-1 text-sm text-text-muted">Current preset: {selectedFont}</p>
                    </div>
                    {savingProject ? <Loader2 className="h-5 w-5 animate-spin text-secondary" /> : <Type className="h-5 w-5 text-primary-soft" />}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    {fontOptions.map((font) => (
                      <button
                        key={font}
                        type="button"
                        onClick={() => updateMutation.mutate({ projectId: project.id, font })}
                        disabled={updateMutation.isPending}
                        className={`flex min-h-16 items-center justify-between rounded-instrument border px-3 py-2 text-left transition ${
                          selectedFont === font ? "border-secondary bg-secondary/10 text-white" : "border-ink-border bg-background text-text-muted hover:border-primary/50 hover:text-white"
                        } disabled:opacity-60`}
                      >
                        <span className="font-display text-sm font-bold">{font}</span>
                        {selectedFont === font ? <Check className="h-4 w-4 text-secondary" /> : null}
                      </button>
                    ))}
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
