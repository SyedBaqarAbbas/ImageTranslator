import { Filter, Plus, Search } from "lucide-react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, queryKeys } from "../api";
import { ProjectCard } from "../components/ProjectCard";
import { ErrorState, LoadingState } from "../components/States";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { assetUrlForPage } from "../lib/assets";

export function Dashboard() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
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

  const covers = useMemo(() => {
    const map = new Map<string, string | undefined>();
    projects.forEach((project, index) => {
      map.set(project.id, assetUrlForPage(pageQueries[index]?.data?.[0], "preview"));
    });
    return map;
  }, [pageQueries, projects]);

  const filteredProjects = projects.filter((project) => {
    const matchesSearch = project.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filter === "all" ||
      (filter === "active" && !["completed", "export_ready"].includes(project.status)) ||
      (filter === "completed" && ["completed", "export_ready"].includes(project.status));
    return matchesSearch && matchesFilter;
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
                onChange={(event) => setSearch(event.target.value)}
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
              className={`rounded-instrument px-4 py-2 text-sm font-bold transition ${
                filter === value ? "border border-primary/40 bg-primary/15 text-primary-soft" : "text-text-muted hover:bg-surface-high hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
          <button className="inline-flex items-center gap-2 rounded-instrument px-4 py-2 text-sm font-bold text-text-muted transition hover:bg-surface-high hover:text-white">
            <Filter className="h-4 w-4" />
            Filters
          </button>
        </div>

        {projectsQuery.isLoading ? <LoadingState /> : null}
        {projectsQuery.isError ? <ErrorState message={projectsQuery.error.message} /> : null}

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
              <ProjectCard key={project.id} project={project} coverUrl={covers.get(project.id)} />
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
