import { Bell, CircleHelp, Search, Share2, UploadCloud } from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router-dom";

export function TopNav() {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-ink-border bg-background/86 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-7">
          <Link to="/projects" className="shrink-0 font-display text-xl font-black uppercase tracking-normal text-white">
            ComicFlow AI
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {[
              ["Projects", "/projects"],
              ["Assets", "/projects"],
              ["Team", "/projects"],
              ["Settings", "/projects"],
            ].map(([label, href]) => (
              <NavLink
                key={label}
                to={href}
                className={({ isActive }) =>
                  `rounded-instrument px-3 py-2 text-sm font-semibold transition ${
                    isActive ? "bg-primary/14 text-primary-soft" : "text-text-muted hover:bg-surface-high hover:text-white"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
          <label className="relative hidden xl:block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              className="h-9 w-56 rounded-instrument border border-ink-border bg-surface px-9 text-sm text-text-main outline-none transition focus:border-secondary"
              placeholder="Search..."
            />
          </label>
          <button className="rounded-instrument p-2 text-text-muted transition hover:bg-surface-high hover:text-white" aria-label="Notifications">
            <Bell className="h-5 w-5" />
          </button>
          <button className="hidden rounded-instrument p-2 text-text-muted transition hover:bg-surface-high hover:text-white sm:block" aria-label="Help">
            <CircleHelp className="h-5 w-5" />
          </button>
          <button className="hidden items-center gap-2 rounded-instrument border border-ink-border px-3 py-2 text-sm font-semibold text-text-main transition hover:bg-surface-high xl:flex">
            <Share2 className="h-4 w-4" />
            Share
          </button>
          <button
            onClick={() => navigate("/")}
            aria-label="New project"
            className="inline-flex items-center gap-2 rounded-instrument bg-primary px-3 py-2 text-sm font-semibold text-white shadow-glow transition hover:bg-violet-500"
          >
            <UploadCloud className="h-4 w-4" />
            <span className="hidden xl:inline">New Project</span>
          </button>
        </div>
      </div>
    </header>
  );
}
