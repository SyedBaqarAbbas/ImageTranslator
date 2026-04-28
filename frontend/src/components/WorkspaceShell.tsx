import { Archive, Contact, FileStack, Home, Layers, PenLine, Settings, Type } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, useNavigate, useParams } from "react-router-dom";

import { api, queryKeys } from "../api";
import { TopNav } from "./TopNav";

export function WorkspaceShell({ children, fullHeight = false }: { children: React.ReactNode; fullHeight?: boolean }) {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const projectsQuery = useQuery({ queryKey: queryKeys.projects, queryFn: api.listProjects });
  const fallbackProjectId = projectsQuery.data?.[0]?.id;
  const editorProjectId = projectId ?? fallbackProjectId;
  const navItems = [
    { label: "Dashboard", href: "/projects", icon: Home },
    { label: "Editor", href: editorProjectId ? `/projects/${editorProjectId}/editor` : null, icon: PenLine },
    { label: "Batch OCR", href: "/batch-ocr", icon: Layers },
    { label: "Typefaces", href: "/typefaces", icon: Type },
    { label: "Archive", href: "/archive", icon: Archive },
  ];

  return (
    <div className="min-h-screen bg-background text-text-main">
      <TopNav />
      <div className="flex">
        <aside className="sticky top-16 hidden h-[calc(100vh-64px)] w-20 shrink-0 flex-col border-r border-ink-border bg-surface-low py-5 transition-all duration-300 hover:w-64 md:flex">
          <div className="mb-7 flex items-center gap-3 px-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-instrument border border-ink-border bg-surface-high text-primary-soft">
              <FileStack className="h-5 w-5" />
            </div>
            <div className="w-0 min-w-0 overflow-hidden opacity-0 transition-all duration-200 [aside:hover_&]:w-auto [aside:hover_&]:opacity-100">
              <p className="font-display text-base font-bold text-white">Workspace</p>
              <p className="text-xs font-semibold uppercase text-text-muted">Darkroom</p>
            </div>
          </div>

          <button
            onClick={() => navigate("/")}
            className="mx-4 mb-6 flex items-center justify-center gap-2 rounded-instrument bg-primary px-3 py-3 text-sm font-semibold text-white shadow-glow transition hover:bg-violet-500"
          >
            <PenLine className="h-4 w-4 shrink-0" />
            <span className="w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all [aside:hover_&]:w-auto [aside:hover_&]:opacity-100">
              New Project
            </span>
          </button>

          <nav className="flex flex-1 flex-col gap-1">
            {navItems.map(({ label, href, icon: Icon }) => (
              href ? (
                <NavLink
                  key={label}
                  to={href}
                  className={({ isActive }) =>
                    `flex items-center gap-4 overflow-hidden border-l-4 px-5 py-3 text-sm font-semibold transition ${
                      isActive
                        ? "border-primary bg-primary/12 text-primary-soft"
                        : "border-transparent text-text-muted hover:bg-surface-high hover:text-white"
                    }`
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all [aside:hover_&]:w-auto [aside:hover_&]:opacity-100">{label}</span>
                </NavLink>
              ) : (
                <button
                  key={label}
                  type="button"
                  disabled
                  title="Create a project before opening the editor"
                  className="flex items-center gap-4 overflow-hidden border-l-4 border-transparent px-5 py-3 text-left text-sm font-semibold text-text-muted opacity-50"
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all [aside:hover_&]:w-auto [aside:hover_&]:opacity-100">{label}</span>
                </button>
              )
            ))}
          </nav>

          <div className="border-t border-ink-border px-5 pt-4 text-text-muted">
            <NavLink className="flex items-center gap-4 overflow-hidden py-2 text-sm transition hover:text-white" to="/support">
              <Contact className="h-5 w-5 shrink-0" />
              <span className="w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all [aside:hover_&]:w-auto [aside:hover_&]:opacity-100">Support</span>
            </NavLink>
            <NavLink className="flex items-center gap-4 overflow-hidden py-2 text-sm transition hover:text-white" to="/account">
              <Settings className="h-5 w-5 shrink-0" />
              <span className="w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all [aside:hover_&]:w-auto [aside:hover_&]:opacity-100">Account</span>
            </NavLink>
          </div>
        </aside>
        <main className={`min-w-0 flex-1 ${fullHeight ? "h-[calc(100vh-64px)] overflow-hidden" : ""}`}>{children}</main>
      </div>
    </div>
  );
}
