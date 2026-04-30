import { MoreHorizontal, PenLine, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { formatRelative } from "../lib/dates";
import { routeForProject } from "../lib/routing";
import type { ProjectRead } from "../types/api";
import { StatusPill } from "./StatusPill";

export function ProjectCard({ project, coverUrl }: { project: ProjectRead; coverUrl?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const route = routeForProject(project);

  return (
    <article className="group relative overflow-hidden rounded-lg border border-ink-border bg-surface transition hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-glow">
      <div className="relative aspect-[4/3] overflow-hidden border-b border-ink-border bg-surface-low">
        {coverUrl ? (
          <img className="h-full w-full object-cover opacity-75 grayscale transition duration-500 group-hover:scale-105 group-hover:opacity-100 group-hover:grayscale-0" src={coverUrl} alt="" />
        ) : (
          <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#111827,#1A1D28)] text-primary-soft">
            <Sparkles className="h-10 w-10" />
          </div>
        )}
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-instrument border border-ink-border bg-background/80 text-text-muted opacity-0 backdrop-blur transition hover:text-white group-hover:opacity-100"
          aria-label={`Open ${project.name} options`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menuOpen ? (
          <div className="absolute right-3 top-14 z-10 w-44 rounded-lg border border-ink-border bg-surface p-2 shadow-2xl">
            <Link className="block rounded-instrument px-3 py-2 text-sm font-semibold text-text-main transition hover:bg-surface-high" to={route}>
              Open workspace
            </Link>
            <Link className="block rounded-instrument px-3 py-2 text-sm font-semibold text-text-main transition hover:bg-surface-high" to={`/projects/${project.id}/export`}>
              Export
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="block w-full rounded-instrument px-3 py-2 text-left text-sm font-semibold text-text-muted transition hover:bg-surface-high hover:text-white"
            >
              Close menu
            </button>
          </div>
        ) : null}
      </div>
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <StatusPill status={project.status} />
          <span className="text-xs font-semibold text-text-muted">{formatRelative(project.updated_at)}</span>
        </div>
        <h3 className="font-display text-xl font-bold text-white transition group-hover:text-primary-soft">{project.name}</h3>
        <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-text-muted">{project.description ?? "Translation workspace"}</p>
        <div className="mt-5 flex items-center justify-between border-t border-ink-border pt-4">
          <span className="text-xs font-bold uppercase text-text-muted">
            {project.source_language.toUpperCase()} to {project.target_language.toUpperCase()}
          </span>
          <Link to={route} className="inline-flex min-h-9 items-center gap-1.5 rounded-instrument px-2 text-sm font-bold text-primary-soft transition hover:bg-primary/10 hover:text-secondary">
            <PenLine className="h-4 w-4" />
            Open
          </Link>
        </div>
      </div>
    </article>
  );
}
