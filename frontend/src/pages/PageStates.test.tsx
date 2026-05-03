import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PageRead, ProcessingJobRead, ProjectDetail, ProjectRead } from "../types/api";
import { Assets } from "./Assets";
import { Dashboard } from "./Dashboard";
import { Export } from "./Export";
import { Processing } from "./Processing";

const mocks = vi.hoisted(() => ({
  api: {
    listProjects: vi.fn(),
    getProject: vi.fn(),
    listPages: vi.fn(),
    getProcessingJobs: vi.fn(),
    processProject: vi.fn(),
    createExport: vi.fn(),
    getExportJob: vi.fn(),
  },
}));

vi.mock("../api", () => ({
  api: mocks.api,
  queryKeys: {
    projects: ["projects"],
    project: (projectId: string) => ["project", projectId],
    pages: (projectId: string) => ["pages", projectId],
    jobs: (projectId: string) => ["jobs", projectId],
    exportJob: (exportJobId: string) => ["export-job", exportJobId],
  },
}));

const now = "2026-05-02T12:00:00.000Z";
const project: ProjectDetail = {
  id: "project-state",
  user_id: "user-1",
  name: "State Coverage Project",
  description: null,
  source_language: "ja",
  target_language: "en",
  translation_tone: "natural",
  replacement_mode: "replace",
  reading_direction: "rtl",
  status: "failed",
  failure_reason: "Provider crashed",
  settings: null,
  created_at: now,
  updated_at: now,
};
const page: PageRead = {
  id: "page-state",
  project_id: project.id,
  page_number: 1,
  original_asset_id: "asset-original",
  processed_asset_id: null,
  cleaned_asset_id: null,
  preview_asset_id: null,
  final_asset_id: null,
  width: 640,
  height: 960,
  status: "failed",
  progress: 45,
  failure_reason: "Provider crashed",
  original_asset: null,
  cleaned_asset: null,
  preview_asset: null,
  final_asset: null,
  created_at: now,
  updated_at: now,
};
const failedJob: ProcessingJobRead = {
  id: "job-state",
  project_id: project.id,
  page_id: page.id,
  region_id: null,
  job_type: "process_project",
  status: "failed",
  progress: 45,
  stage: "translating_regions",
  error_code: "ProviderError",
  error_message: "Provider crashed",
  attempts: 1,
  max_attempts: 3,
  celery_task_id: null,
  result: null,
  started_at: now,
  completed_at: now,
  created_at: now,
  updated_at: now,
};

function renderRoute(initialPath: string, routePath: string, element: ReactElement) {
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
          <Route path={routePath} element={element} />
          <Route path="*" element={<div>fallback</div>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("route state coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.api.listProjects.mockResolvedValue([]);
    mocks.api.getProject.mockResolvedValue(project);
    mocks.api.listPages.mockResolvedValue([]);
    mocks.api.getProcessingJobs.mockResolvedValue([]);
  });

  it("renders the dashboard empty state and API error state", async () => {
    renderRoute("/projects", "/projects", <Dashboard />);
    expect(await screen.findByText("No projects yet")).toBeInTheDocument();

    mocks.api.listProjects.mockRejectedValueOnce(new Error("Projects unavailable"));
    renderRoute("/projects", "/projects", <Dashboard />);
    expect(await screen.findByText("Projects unavailable")).toBeInTheDocument();
  });

  it("renders assets empty and page-query error states", async () => {
    renderRoute("/assets", "/assets", <Assets />);
    expect(await screen.findByText("No assets found")).toBeInTheDocument();

    mocks.api.listProjects.mockResolvedValueOnce([project as ProjectRead]);
    mocks.api.listPages.mockRejectedValueOnce(new Error("Pages unavailable"));
    renderRoute("/assets", "/assets", <Assets />);
    expect(await screen.findByText("Pages unavailable")).toBeInTheDocument();
  });

  it("renders failed processing state with page and job details", async () => {
    mocks.api.listProjects.mockResolvedValue([project as ProjectRead]);
    mocks.api.listPages.mockResolvedValue([page]);
    mocks.api.getProcessingJobs.mockResolvedValue([failedJob]);

    renderRoute(`/projects/${project.id}/processing`, "/projects/:projectId/processing", <Processing />);

    expect(await screen.findByText("translating_regions")).toBeInTheDocument();
    expect(screen.getAllByText("45%")).toHaveLength(2);
    expect(screen.getAllByText(/failed/i).length).toBeGreaterThan(0);
  });

  it("surfaces export failure when no pages are available", async () => {
    mocks.api.listProjects.mockResolvedValue([project as ProjectRead]);
    const failedExport = {
      id: "export-empty",
      user_id: project.user_id,
      project_id: project.id,
      format: "zip",
      status: "failed",
      progress: 100,
      asset_id: null,
      error_message: "No pages are available to export.",
      settings: null,
      started_at: now,
      completed_at: now,
      asset: null,
      created_at: now,
      updated_at: now,
    };
    mocks.api.createExport.mockResolvedValue(failedExport);
    mocks.api.getExportJob.mockResolvedValue(failedExport);

    renderRoute(`/projects/${project.id}/export`, "/projects/:projectId/export", <Export />);
    fireEvent.click(await screen.findByRole("button", { name: /export project/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pages are available to export");
  });
});
