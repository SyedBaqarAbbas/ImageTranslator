import { MoreHorizontal, PenLine, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { formatRelative } from "../lib/dates";
import { routeForProject } from "../lib/routing";
import type { ProjectRead } from "../types/api";
import { StatusPill } from "./StatusPill";

export function ProjectCard({ project, coverUrl }: { project: ProjectRead; coverUrl?: string }) {
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
        <button className="absolute right-3 top-3 rounded-instrument border border-ink-border bg-background/80 p-1.5 text-text-muted opacity-0 backdrop-blur transition hover:text-white group-hover:opacity-100" aria-label={`Open ${project.name} options`}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
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
          <Link to={routeForProject(project)} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-soft transition hover:text-secondary">
            <PenLine className="h-4 w-4" />
            Open
          </Link>
        </div>
      </div>
    </article>
  );
}
