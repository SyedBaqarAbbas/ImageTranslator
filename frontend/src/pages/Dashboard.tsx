import { Filter, Plus, Search } from "lucide-react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { api, queryKeys } from "../api";
import { ProjectCard } from "../components/ProjectCard";
import { ErrorState, LoadingState } from "../components/States";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { assetUrlForPage } from "../lib/assets";
import type { ProjectRead } from "../types/api";

export function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortMode, setSortMode] = useState<"recent" | "name">("recent");
  const search = searchParams.get("search") ?? "";
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const projectsQuery = useQuery({ queryKey: queryKeys.projects, queryFn: api.listProjects });
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);

  const deleteMutation = useMutation({
    mutationFn: (projectId: string) => api.deleteProject(projectId),
    onMutate: () => {
      setDeleteError(null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
    onError: (error) => {
      const message = error instanceof Error && error.message ? error.message : "The request failed.";
      setDeleteError(`Unable to delete project: ${message}`);
    },
  });

  function handleSearchChange(value: string) {
    const nextParams = new URLSearchParams(searchParams);
    if (value.trim()) {
      nextParams.set("search", value);
    } else {
      nextParams.delete("search");
    }
    setSearchParams(nextParams, { replace: true });
  }

  function handleDeleteProject(project: ProjectRead) {
    const confirmed = window.confirm(`Delete "${project.name}"?\n\nThis hides the project from the dashboard.`);
    if (!confirmed) {
      return;
    }
    deleteMutation.mutate(project.id);
  }

  const pageQueries = useQueries({
    queries: projects.map((project) => ({
      queryKey: queryKeys.pages(project.id),
      queryFn: () => api.listPages(project.id),
      enabled: projects.length > 0,
    })),
  });

  const covers = useMemo(() => {
    const map = new Map<string, string | undefined>();
    projects.forEach((project, index) => {
      map.set(project.id, assetUrlForPage(pageQueries[index]?.data?.[0], "preview"));
    });
    return map;
  }, [pageQueries, projects]);

  const filteredProjects = projects
    .filter((project) => {
      const matchesSearch = project.name.toLowerCase().includes(search.toLowerCase());
      const matchesFilter =
        filter === "all" ||
        (filter === "active" && !["completed", "export_ready"].includes(project.status)) ||
        (filter === "completed" && ["completed", "export_ready"].includes(project.status));
      return matchesSearch && matchesFilter;
    })
    .sort((left, right) => {
      if (sortMode === "name") {
        return left.name.localeCompare(right.name);
      }
      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    });

  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold text-white">Projects</h1>
            <p className="mt-2 text-sm text-text-muted">Scan, translate, review, and export every active comic workspace.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                value={search}
                onChange={(event) => handleSearchChange(event.target.value)}
                className="h-11 w-full rounded-lg border border-ink-border bg-surface px-10 text-sm text-text-main outline-none focus:border-secondary sm:w-80"
                placeholder="Search projects..."
              />
            </label>
            <button onClick={() => navigate("/")} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-violet-500">
              <Plus className="h-4 w-4" />
              New Project
            </button>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          {[
            ["all", "All"],
            ["active", "In Progress"],
            ["completed", "Completed"],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value as "all" | "active" | "completed")}
              aria-pressed={filter === value}
              className={`rounded-instrument px-4 py-2 text-sm font-bold transition ${
                filter === value ? "border border-primary/40 bg-primary/15 text-primary-soft" : "text-text-muted hover:bg-surface-high hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-instrument px-4 py-2 text-sm font-bold text-text-muted transition hover:bg-surface-high hover:text-white"
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>
        </div>

        {filtersOpen ? (
          <section className="mb-6 rounded-lg border border-ink-border bg-surface-low p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-white">Project filters</h2>
                <p className="mt-1 text-sm text-text-muted">Sort and narrow the current project grid.</p>
              </div>
              <div className="flex gap-2">
                {[
                  ["recent", "Recent"],
                  ["name", "Name"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={sortMode === value}
                    onClick={() => setSortMode(value as "recent" | "name")}
                    className={`rounded-instrument border px-3 py-2 text-sm font-bold transition ${
                      sortMode === value ? "border-secondary bg-secondary/10 text-white" : "border-ink-border bg-background text-text-muted hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {projectsQuery.isLoading ? <LoadingState /> : null}
        {projectsQuery.isError ? <ErrorState message={projectsQuery.error.message} /> : null}
        {deleteError ? (
          <p role="alert" className="mb-6 rounded-instrument border border-danger/40 bg-danger/10 p-3 text-sm font-semibold text-danger">
            {deleteError}
          </p>
        ) : null}

        {!projectsQuery.isLoading && !projectsQuery.isError && filteredProjects.length === 0 ? (
          <section className="flex min-h-[520px] items-center justify-center rounded-lg border border-dashed border-ink-border bg-surface-low p-8 text-center">
            <div className="max-w-md">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary-soft">
                <Plus className="h-9 w-9" />
              </div>
              <h2 className="font-display text-2xl font-bold text-white">No projects yet</h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">Start with raw manga pages or a ZIP archive and the workspace will appear here after setup.</p>
              <button onClick={() => navigate("/")} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-white shadow-glow transition hover:bg-violet-500">
                <Plus className="h-4 w-4" />
                Start New Project
              </button>
            </div>
          </section>
        ) : null}

        {filteredProjects.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                coverUrl={covers.get(project.id)}
                onDelete={() => handleDeleteProject(project)}
                isDeleteDisabled={deleteMutation.isPending}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === project.id}
              />
            ))}
            <button onClick={() => navigate("/")} className="min-h-[360px] rounded-lg border border-dashed border-ink-border bg-background p-6 text-text-muted transition hover:border-primary hover:bg-primary/5 hover:text-primary-soft">
              <Plus className="mx-auto mb-4 h-10 w-10" />
              <span className="font-display text-lg font-bold">Create New Project</span>
            </button>
          </div>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}
