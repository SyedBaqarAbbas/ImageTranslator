import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AssetRead,
  ExportJobRead,
  PageRead,
  ProcessingJobRead,
  ProjectDetail,
  ProjectRead,
  RuntimeLanguageRead,
  TextRegionRead,
  TranslationSettingsRead,
} from "../types/api";

const mocks = vi.hoisted(() => ({
  api: {
    getRuntimeLanguage: vi.fn(),
    listProjects: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    updateSettings: vi.fn(),
    uploadPages: vi.fn(),
    getProject: vi.fn(),
    listPages: vi.fn(),
    getPage: vi.fn(),
    listRegions: vi.fn(),
    updateRegion: vi.fn(),
    deleteRegion: vi.fn(),
    retranslateRegion: vi.fn(),
    getProcessingJob: vi.fn(),
    processProject: vi.fn(),
    getProcessingJobs: vi.fn(),
    createExport: vi.fn(),
    getExportJob: vi.fn(),
  },
  uploadFlow: {
    pendingFiles: [] as File[],
    setPendingFiles: vi.fn(),
    clearPendingFiles: vi.fn(),
  },
}));

vi.mock("../api", () => ({
  api: mocks.api,
  queryKeys: {
    runtimeLanguage: ["runtime-language"],
    projects: ["projects"],
    project: (projectId: string) => ["project", projectId],
    pages: (projectId: string) => ["pages", projectId],
    page: (projectId: string, pageId: string) => ["page", projectId, pageId],
    regions: (pageId: string) => ["regions", pageId],
    jobs: (projectId: string) => ["jobs", projectId],
    exportJob: (exportJobId: string) => ["export-job", exportJobId],
  },
}));

vi.mock("../lib/uploadFlow", () => ({
  useUploadFlow: () => mocks.uploadFlow,
}));

vi.mock("../components/CanvasWorkspace", () => ({
  CanvasWorkspace: () => <div data-testid="canvas-workspace">Canvas workspace</div>,
}));

vi.mock("../components/RegionPanel", () => ({
  RegionPanel: ({
    regions,
    selectedRegionId,
    onSave,
    onRetranslate,
  }: {
    regions: TextRegionRead[];
    selectedRegionId?: string;
    onSave: (regionId: string, payload: { user_text: string }, action: "panel") => void;
    onRetranslate: (regionId: string, sourceText: string | null, source: "detected") => void;
  }) => {
    const selectedRegion = regions.find((item) => item.id === selectedRegionId) ?? regions[0];
    return (
      <aside data-testid="region-panel">
        <p>{selectedRegion?.translated_text ?? "No region selected"}</p>
        <button type="button" onClick={() => selectedRegion && onSave(selectedRegion.id, { user_text: "Panel edit" }, "panel")}>
          Save panel region
        </button>
        <button type="button" onClick={() => selectedRegion && onRetranslate(selectedRegion.id, selectedRegion.detected_text, "detected")}>
          Retranslate panel region
        </button>
      </aside>
    );
  },
}));

import { Assets } from "./Assets";
import { BatchOCR } from "./BatchOCR";
import { Dashboard } from "./Dashboard";
import { Editor } from "./Editor";
import { Export } from "./Export";
import { LandingUpload } from "./LandingUpload";
import { Processing } from "./Processing";
import { Review } from "./Review";
import { Typefaces } from "./Typefaces";

const now = "2026-05-02T12:00:00.000Z";

const runtimeLanguage: RuntimeLanguageRead = {
  source_language: "ja",
  target_language: "en",
  provider: "mock",
  locked: true,
  lock_message: "Ask a system administrator to change the language.",
};

const settings: TranslationSettingsRead = {
  id: "settings-1",
  project_id: "project-1",
  source_language: "ja",
  target_language: "en",
  translation_tone: "natural",
  replacement_mode: "replace",
  reading_direction: "rtl",
  preserve_sfx: true,
  bilingual: false,
  font_family: "Anime Ace",
  notes: null,
  created_at: now,
  updated_at: now,
};

const project: ProjectDetail = {
  id: "project-1",
  user_id: "user-1",
  name: "Project Alpha",
  description: "Release workflow fixture",
  source_language: "ja",
  target_language: "en",
  translation_tone: "natural",
  replacement_mode: "replace",
  reading_direction: "rtl",
  status: "review_required",
  failure_reason: null,
  settings,
  created_at: now,
  updated_at: now,
};

const completedProject: ProjectRead = {
  ...project,
  id: "project-2",
  name: "Project Beta",
  status: "export_ready",
};

const asset: AssetRead = {
  id: "asset-1",
  user_id: "user-1",
  project_id: "project-1",
  page_id: "page-1",
  kind: "final",
  storage_backend: "local",
  bucket: null,
  key: "projects/project-1/final/page.png",
  filename: "page.png",
  content_type: "image/png",
  size_bytes: 123,
  checksum: null,
  width: 640,
  height: 960,
  url: "data:image/png;base64,iVBORw0KGgo=",
  created_at: now,
  updated_at: now,
};

const page: PageRead = {
  id: "page-1",
  project_id: "project-1",
  page_number: 1,
  original_asset_id: "asset-original",
  processed_asset_id: "asset-processed",
  cleaned_asset_id: "asset-cleaned",
  preview_asset_id: "asset-preview",
  final_asset_id: asset.id,
  width: 640,
  height: 960,
  status: "review_required",
  progress: 100,
  failure_reason: null,
  original_asset: { ...asset, id: "asset-original", kind: "original" },
  cleaned_asset: { ...asset, id: "asset-cleaned", kind: "cleaned" },
  preview_asset: { ...asset, id: "asset-preview", kind: "preview" },
  final_asset: asset,
  created_at: now,
  updated_at: now,
};

const region: TextRegionRead = {
  id: "region-1",
  page_id: page.id,
  region_index: 1,
  region_type: "speech",
  bounding_box: { x: 10, y: 20, width: 120, height: 60 },
  polygon: null,
  detected_text: "こんにちは",
  detected_language: "ja",
  translated_text: "Hello",
  user_text: null,
  ocr_confidence: 0.62,
  translation_confidence: 0.7,
  render_style: { fontSize: 24 },
  editable: true,
  status: "needs_review",
  failure_reason: null,
  created_at: now,
  updated_at: now,
};

const processingJob: ProcessingJobRead = {
  id: "job-1",
  project_id: project.id,
  page_id: page.id,
  region_id: null,
  job_type: "process_project",
  status: "running",
  progress: 47,
  stage: "translating_regions",
  error_code: null,
  error_message: null,
  attempts: 1,
  max_attempts: 3,
  celery_task_id: null,
  result: null,
  started_at: now,
  completed_at: null,
  created_at: now,
  updated_at: now,
};

const exportJob: ExportJobRead = {
  id: "export-1",
  user_id: project.user_id,
  project_id: project.id,
  format: "pdf",
  status: "succeeded",
  progress: 100,
  asset_id: "asset-export",
  error_message: null,
  settings: null,
  started_at: now,
  completed_at: now,
  asset: {
    ...asset,
    id: "asset-export",
    kind: "export",
    filename: "release.pdf",
    content_type: "application/pdf",
    url: "http://testserver/export.pdf",
  },
  created_at: now,
  updated_at: now,
};

function LocationMarker() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

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
          <Route path="*" element={<LocationMarker />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("release workflow pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("confirm", vi.fn(() => true));
    mocks.uploadFlow.pendingFiles = [];
    mocks.api.getRuntimeLanguage.mockResolvedValue(runtimeLanguage);
    mocks.api.listProjects.mockResolvedValue([project, completedProject]);
    mocks.api.createProject.mockResolvedValue(project);
    mocks.api.updateProject.mockResolvedValue(project);
    mocks.api.deleteProject.mockResolvedValue(undefined);
    mocks.api.updateSettings.mockResolvedValue(settings);
    mocks.api.uploadPages.mockResolvedValue([page]);
    mocks.api.getProject.mockResolvedValue(project);
    mocks.api.listPages.mockResolvedValue([page]);
    mocks.api.getPage.mockResolvedValue(page);
    mocks.api.listRegions.mockResolvedValue([region]);
    mocks.api.updateRegion.mockResolvedValue({ ...region, editable: false, user_text: "Hello", status: "user_edited" });
    mocks.api.deleteRegion.mockResolvedValue({ ...processingJob, job_type: "rerender_page", status: "succeeded" });
    mocks.api.retranslateRegion.mockResolvedValue({ ...processingJob, job_type: "retranslate_region", region_id: region.id, status: "succeeded" });
    mocks.api.getProcessingJob.mockResolvedValue({ ...processingJob, status: "succeeded", progress: 100 });
    mocks.api.processProject.mockResolvedValue(processingJob);
    mocks.api.getProcessingJobs.mockResolvedValue([processingJob]);
    mocks.api.createExport.mockResolvedValue(exportJob);
    mocks.api.getExportJob.mockResolvedValue(exportJob);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores uploaded files from the landing page and routes to setup", async () => {
    const { container } = renderRoute("/", "/", <LandingUpload />);
    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();

    const file = new File(["page"], "page.png", { type: "image/png" });
    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => expect(mocks.uploadFlow.setPendingFiles).toHaveBeenCalledWith([file]));
    expect(await screen.findByTestId("location")).toHaveTextContent("/projects/new");
  });

  it("searches, sorts, and deletes projects from the dashboard", async () => {
    renderRoute("/projects", "/projects", <Dashboard />);

    expect(await screen.findByText("Project Alpha")).toBeInTheDocument();
    const dashboardSearch = screen.getAllByPlaceholderText("Search projects...").at(-1)!;
    fireEvent.change(dashboardSearch, { target: { value: "beta" } });
    expect(screen.queryByText("Project Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Project Beta")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    fireEvent.change(dashboardSearch, { target: { value: "" } });

    fireEvent.click(await screen.findByLabelText("Open Project Alpha options"));
    fireEvent.click(screen.getByRole("button", { name: /delete project/i }));

    await waitFor(() => expect(mocks.api.deleteProject).toHaveBeenCalledWith("project-1"));
  });

  it("reruns and cancels processing from the processing workspace", async () => {
    mocks.api.getProject.mockResolvedValueOnce({ ...project, status: "processing" });
    renderRoute("/projects/project-1/processing", "/projects/:projectId/processing", <Processing />);

    expect(await screen.findByText("Project Alpha")).toBeInTheDocument();
    expect(screen.getByText("translating_regions")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /rerun processing/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel processing/i }));

    await waitFor(() => expect(mocks.api.processProject).toHaveBeenCalledWith("project-1", { force: true }));
    expect(screen.getByText(/cancellation requested/i)).toBeInTheDocument();
  });

  it("approves flagged regions in review", async () => {
    renderRoute("/projects/project-1/review", "/projects/:projectId/review", <Review />);

    expect(await screen.findByText("Quality Review Mode")).toBeInTheDocument();
    const flaggedCard = screen.getByText("こんにちは").closest("article");
    expect(flaggedCard).not.toBeNull();
    fireEvent.click(within(flaggedCard as HTMLElement).getByRole("button", { name: /approve/i }));

    await waitFor(() =>
      expect(mocks.api.updateRegion).toHaveBeenCalledWith(
        "region-1",
        expect.objectContaining({
          user_text: "Hello",
          editable: false,
          auto_rerender: true,
        }),
      ),
    );
  });

  it("edits and retranslates a region from the editor page", async () => {
    renderRoute("/projects/project-1/editor", "/projects/:projectId/editor", <Editor />);

    expect(await screen.findByTestId("canvas-workspace")).toBeInTheDocument();
    expect(await screen.findByText("Hello")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save panel region/i }));
    fireEvent.click(screen.getByRole("button", { name: /retranslate panel region/i }));

    await waitFor(() => expect(mocks.api.updateRegion).toHaveBeenCalledWith("region-1", expect.objectContaining({ user_text: "Panel edit" })));
    await waitFor(() =>
      expect(mocks.api.retranslateRegion).toHaveBeenCalledWith(
        "region-1",
        expect.objectContaining({
          source_text: "こんにちは",
          target_language: "en",
        }),
      ),
    );
  });

  it("creates a PDF export with backend-safe options", async () => {
    renderRoute("/projects/project-1/export", "/projects/:projectId/export", <Export />);

    expect(await screen.findByText("Format Selection")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /pdf/i }));
    fireEvent.change(screen.getByPlaceholderText("Project Alpha-translated"), { target: { value: "release" } });
    fireEvent.click(screen.getByRole("button", { name: /export project/i }));

    await waitFor(() =>
      expect(mocks.api.createExport).toHaveBeenCalledWith("project-1", {
        format: "pdf",
        include_originals: false,
        filename: "release",
      }),
    );
    expect(await screen.findByRole("link", { name: /download export/i })).toHaveAttribute("href", "http://testserver/export.pdf");
  });

  it("lists assets and filters empty asset results", async () => {
    mocks.api.listPages.mockImplementation((projectId: string) =>
      Promise.resolve([
        {
          ...page,
          id: `page-${projectId}`,
          project_id: projectId,
          final_asset: { ...asset, id: `asset-${projectId}`, project_id: projectId },
        },
      ]),
    );
    renderRoute("/assets", "/assets", <Assets />);

    expect(await screen.findByRole("heading", { name: "Assets" })).toBeInTheDocument();
    expect(await screen.findByText("Project Alpha")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Search assets..."), { target: { value: "missing" } });
    expect(screen.getByText("No assets found")).toBeInTheDocument();
  });

  it("queues batch OCR and updates typeface settings", async () => {
    const batchView = renderRoute("/batch-ocr", "/batch-ocr", <BatchOCR />);
    fireEvent.click((await screen.findAllByRole("button", { name: /run ocr/i }))[0]);
    await waitFor(() => expect(mocks.api.processProject).toHaveBeenCalledWith("project-1", { force: true }));
    batchView.unmount();

    renderRoute("/typefaces", "/typefaces", <Typefaces />);
    fireEvent.click((await screen.findAllByRole("button", { name: /komika/i }))[0]);
    await waitFor(() => expect(mocks.api.updateSettings).toHaveBeenCalledWith("project-1", { font_family: "Komika" }));
  });
});
