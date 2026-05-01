import { Bell, CircleHelp, Search, Share2, UploadCloud } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

const SHARE_ENABLED = false;
type TopNavMenu = "notifications" | "help" | "share";

export function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [openMenu, setOpenMenu] = useState<TopNavMenu | null>(null);
  const [shareStatus, setShareStatus] = useState("Copy link");
  const notificationsTriggerRef = useRef<HTMLButtonElement>(null);
  const helpTriggerRef = useRef<HTMLButtonElement>(null);
  const shareTriggerRef = useRef<HTMLButtonElement>(null);
  const notificationsPopoverRef = useRef<HTMLDivElement>(null);
  const helpPopoverRef = useRef<HTMLDivElement>(null);
  const sharePopoverRef = useRef<HTMLDivElement>(null);
  const currentUrl = `${window.location.origin}${location.pathname}${location.search}`;

  useEffect(() => {
    setOpenMenu(null);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (openMenu === null) {
      return;
    }

    const activeMenu = openMenu;

    function getActiveElements() {
      switch (activeMenu) {
        case "notifications":
          return { trigger: notificationsTriggerRef.current, popover: notificationsPopoverRef.current };
        case "help":
          return { trigger: helpTriggerRef.current, popover: helpPopoverRef.current };
        case "share":
          return { trigger: shareTriggerRef.current, popover: sharePopoverRef.current };
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }

      const { trigger, popover } = getActiveElements();
      if (trigger?.contains(event.target) || popover?.contains(event.target)) {
        return;
      }

      setOpenMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenu(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenu]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    navigate(query ? `/projects?search=${encodeURIComponent(query)}` : "/projects");
  }

  async function handleShare() {
    setOpenMenu((menu) => (menu === "share" ? null : "share"));
    if (!SHARE_ENABLED) {
      return;
    }

    try {
      await navigator.clipboard.writeText(currentUrl);
      setShareStatus("Link copied");
    } catch {
      setShareStatus("Copy manually");
    }
  }

  const navLinks = [
    ["Projects", "/projects"],
    ["Assets", "/assets"],
    ["Settings", "/settings"],
  ] as const;

  return (
    <header className="sticky top-0 z-40 border-b border-ink-border bg-background/86 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-7">
          <Link to="/projects" className="shrink-0 font-display text-xl font-black uppercase tracking-normal text-white">
            ComicFlow AI
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {navLinks.map(([label, href]) => (
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

        <div className="relative flex min-w-0 items-center justify-end gap-2 sm:gap-3">
          <form className="relative hidden xl:block" role="search" onSubmit={handleSearchSubmit}>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 w-56 rounded-instrument border border-ink-border bg-surface px-9 text-sm text-text-main outline-none transition focus:border-secondary"
              placeholder="Search projects..."
            />
          </form>
          <button
            ref={notificationsTriggerRef}
            type="button"
            className="rounded-instrument p-2 text-text-muted transition hover:bg-surface-high hover:text-white"
            aria-label="Notifications"
            aria-expanded={openMenu === "notifications"}
            onClick={() => setOpenMenu((menu) => (menu === "notifications" ? null : "notifications"))}
          >
            <Bell className="h-5 w-5" />
          </button>
          <button
            ref={helpTriggerRef}
            type="button"
            className="hidden rounded-instrument p-2 text-text-muted transition hover:bg-surface-high hover:text-white sm:block"
            aria-label="Help"
            aria-expanded={openMenu === "help"}
            onClick={() => setOpenMenu((menu) => (menu === "help" ? null : "help"))}
          >
            <CircleHelp className="h-5 w-5" />
          </button>
          <div className="relative hidden xl:block">
            <button
              ref={shareTriggerRef}
              type="button"
              className="hidden items-center gap-2 rounded-instrument border border-ink-border px-3 py-2 text-sm font-semibold text-text-main transition hover:bg-surface-high xl:flex"
              onClick={handleShare}
              aria-expanded={openMenu === "share"}
            >
              <Share2 className="h-4 w-4" />
              Share
            </button>

            {openMenu === "share" ? (
              SHARE_ENABLED ? (
                <div
                  ref={sharePopoverRef}
                  className="absolute left-0 top-[calc(100%+0.5rem)] w-80 rounded-lg border border-ink-border bg-surface p-4 shadow-2xl"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="font-display text-sm font-bold text-white">Share workspace</p>
                    <span className="text-xs font-bold text-secondary">{shareStatus}</span>
                  </div>
                  <input
                    readOnly
                    value={currentUrl}
                    className="w-full rounded-instrument border border-ink-border bg-background px-3 py-2 text-xs text-text-muted outline-none"
                    onFocus={(event) => event.target.select()}
                  />
                </div>
              ) : (
                <div
                  ref={sharePopoverRef}
                  className="absolute left-1/2 top-[calc(100%+0.5rem)] -translate-x-1/2 rounded-lg border border-ink-border bg-surface px-4 py-3 text-center shadow-2xl"
                >
                  <p className="font-display text-sm font-bold text-white">Coming Soon</p>
                </div>
              )
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => navigate("/")}
            aria-label="New project"
            aria-current={location.pathname === "/" ? "page" : undefined}
            className="inline-flex items-center gap-2 rounded-instrument bg-primary px-3 py-2 text-sm font-semibold text-white shadow-glow transition hover:bg-violet-500"
          >
            <UploadCloud className="h-4 w-4" />
            <span className="hidden xl:inline">New Project</span>
          </button>

          {openMenu === "notifications" ? (
            <div
              ref={notificationsPopoverRef}
              className="absolute right-20 top-12 w-80 rounded-lg border border-ink-border bg-surface p-4 shadow-2xl sm:right-28"
            >
              <p className="font-display text-sm font-bold text-white">Notifications</p>
              <div className="mt-3 rounded-instrument border border-ink-border bg-background p-3 text-sm text-text-muted">
                No new workspace notifications.
              </div>
            </div>
          ) : null}

          {openMenu === "help" ? (
            <div
              ref={helpPopoverRef}
              className="absolute right-12 top-12 w-64 rounded-lg border border-ink-border bg-surface p-2 shadow-2xl sm:right-16"
            >
              <Link className="block rounded-instrument px-3 py-2 text-sm font-semibold text-text-muted opacity-50 cursor-not-allowed pointer-events-none" to="/support" aria-disabled="true" onClick={(e) => e.preventDefault()}>
                  Support
              </Link>
              <Link className="block rounded-instrument px-3 py-2 text-sm font-semibold text-text-main transition hover:bg-surface-high" to="/settings">
                Workspace settings
              </Link>
              <a className="block rounded-instrument px-3 py-2 text-sm font-semibold text-text-main transition hover:bg-surface-high" href="mailto:baqar2001@hotmail.com">
                Contact support
              </a>
            </div>
          ) : null}

        </div>
      </div>
    </header>
  );
}
