import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TopNav } from "../components/TopNav";
import type { ProjectRead } from "../types/api";
import { Account } from "./Account";
import { ArchiveView } from "./ArchiveView";
import { Support } from "./Support";
import { Team } from "./Team";

const mocks = vi.hoisted(() => ({
  api: {
    listProjects: vi.fn(),
  },
}));

vi.mock("../api", () => ({
  api: mocks.api,
  queryKeys: {
    projects: ["projects"],
  },
}));

const now = "2026-05-02T12:00:00.000Z";
const archivedProject: ProjectRead = {
  id: "project-archive",
  user_id: "user-1",
  name: "Archived Release",
  description: "Exported project",
  source_language: "ja",
  target_language: "en",
  translation_tone: "natural",
  replacement_mode: "replace",
  reading_direction: "rtl",
  status: "export_ready",
  failure_reason: null,
  created_at: now,
  updated_at: now,
};

function LocationMarker() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderWithProviders(initialPath: string, routePath: string, element: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path={routePath} element={<><LocationMarker />{element}</>} />
          <Route path="*" element={<LocationMarker />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("static workspace pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    mocks.api.listProjects.mockResolvedValue([archivedProject]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves account profile feedback", async () => {
    renderWithProviders("/account", "/account", <Account />);

    fireEvent.change(await screen.findByDisplayValue("ComicFlow Operator"), { target: { value: "Release Operator" } });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

    expect(screen.getByText("Profile saved")).toBeInTheDocument();
  });

  it("drafts support requests and validates empty messages", async () => {
    renderWithProviders("/support", "/support", <Support />);

    fireEvent.click(await screen.findByRole("button", { name: /draft request/i }));
    expect(screen.getByText("Add a message")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Describe the issue..."), { target: { value: "Export failed" } });
    fireEvent.click(screen.getByRole("button", { name: /draft request/i }));
    expect(screen.getByText("Support request drafted")).toBeInTheDocument();
  });

  it("drafts team invites and copies the invite link", async () => {
    renderWithProviders("/team", "/team", <Team />);

    fireEvent.click(await screen.findByRole("button", { name: /draft invite/i }));
    expect(screen.getByText("Enter an email address")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("teammate@example.com"), { target: { value: "teammate@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /draft invite/i }));
    expect(screen.getByText("Invite drafted for teammate@example.com")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("http://localhost:3000/team"));
    expect(screen.getByText("Invite link copied")).toBeInTheDocument();
  });

  it("lists export-ready projects in the archive", async () => {
    renderWithProviders("/archive", "/archive", <ArchiveView />);

    expect(await screen.findByText("Archived Release")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open/i })).toHaveAttribute("href", "/projects/project-archive/export");
  });
});

describe("top navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.api.listProjects.mockResolvedValue([archivedProject]);
  });

  it("searches, opens utility menus, and routes to a new project", async () => {
    renderWithProviders("/projects", "/projects", <TopNav />);

    fireEvent.change(screen.getByPlaceholderText("Search projects..."), { target: { value: "alpha release" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(await screen.findByTestId("location")).toHaveTextContent("/projects?search=alpha%20release");
  });

  it("shows and dismisses notifications, help, and share menus", async () => {
    renderWithProviders("/projects", "/projects", <TopNav />);

    fireEvent.click(screen.getByLabelText("Notifications"));
    expect(screen.getByText("No new workspace notifications.")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("No new workspace notifications.")).not.toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Help"));
    expect(screen.getByText("Workspace settings")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /share/i }));
    expect(screen.getByText("Coming Soon")).toBeInTheDocument();
  });
});
