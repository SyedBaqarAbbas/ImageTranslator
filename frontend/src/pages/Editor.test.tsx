import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PageRead, ProcessingJobRead, ProjectDetail, TextRegionCreate, TextRegionRead, TextRegionUpdate } from "../types/api";
import { Editor } from "./Editor";

const mocks = vi.hoisted(() => ({
  retranslateTimeoutMessage: "Translation is taking longer than expected. You can retry or refresh the page to check the job later.",
  ocrTimeoutMessage: "OCR is taking longer than expected. You can retry or refresh the page to check the job later.",
  api: {
    listProjects: vi.fn(),
    getProject: vi.fn(),
    listPages: vi.fn(),
    listRegions: vi.fn(),
    createRegion: vi.fn(),
    updateRegion: vi.fn(),
    deleteRegion: vi.fn(),
    ocrRegion: vi.fn(),
    retranslateRegion: vi.fn(),
    getProcessingJob: vi.fn(),
  },
  waitForSuccessfulOcrJob: vi.fn(),
  waitForSuccessfulRetranslateJob: vi.fn(),
}));

vi.mock("../api", () => ({
  api: mocks.api,
  queryKeys: {
    projects: ["projects"],
    project: (projectId: string) => ["project", projectId],
    pages: (projectId: string) => ["pages", projectId],
    regions: (pageId: string) => ["regions", pageId],
    jobs: (projectId: string) => ["jobs", projectId],
  },
}));

vi.mock("../lib/retranslateJob", () => ({
  OCR_JOB_TIMEOUT_MESSAGE: mocks.ocrTimeoutMessage,
  RETRANSLATE_JOB_TIMEOUT_MESSAGE: mocks.retranslateTimeoutMessage,
  isOcrJobPollingTimeoutError: (error: unknown) =>
    error instanceof Error && error.name === "OcrJobPollingTimeoutError",
  isRetranslateJobPollingTimeoutError: (error: unknown) =>
    error instanceof Error && error.name === "RetranslateJobPollingTimeoutError",
  waitForSuccessfulOcrJob: mocks.waitForSuccessfulOcrJob,
  waitForSuccessfulRetranslateJob: mocks.waitForSuccessfulRetranslateJob,
}));

const now = "2026-05-02T12:00:00.000Z";
const imageUrl = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const project: ProjectDetail = {
  id: "project-editor",
  user_id: "user-1",
  name: "Editor Coverage Project",
  description: null,
  source_language: "ja",
  target_language: "en",
  translation_tone: "natural",
  replacement_mode: "replace",
  reading_direction: "rtl",
  status: "review_required",
  failure_reason: null,
  settings: null,
  created_at: now,
  updated_at: now,
};

const page: PageRead = {
  id: "page-editor-1",
  project_id: project.id,
  page_number: 1,
  original_asset_id: "asset-original",
  processed_asset_id: null,
  cleaned_asset_id: null,
  preview_asset_id: null,
  final_asset_id: "asset-final",
  width: 240,
  height: 320,
  status: "review_required",
  progress: 96,
  failure_reason: null,
  original_asset: {
    id: "asset-original",
    user_id: project.user_id,
    project_id: project.id,
    page_id: "page-editor-1",
    kind: "original",
    storage_backend: "local",
    bucket: null,
    key: "original.png",
    filename: "original.png",
    content_type: "image/png",
    size_bytes: 10,
    checksum: null,
    width: 240,
    height: 320,
    url: imageUrl,
    created_at: now,
    updated_at: now,
  },
  cleaned_asset: null,
  preview_asset: null,
  final_asset: {
    id: "asset-final",
    user_id: project.user_id,
    project_id: project.id,
    page_id: "page-editor-1",
    kind: "final",
    storage_backend: "local",
    bucket: null,
    key: "final.png",
    filename: "final.png",
    content_type: "image/png",
    size_bytes: 10,
    checksum: null,
    width: 240,
    height: 320,
    url: imageUrl,
    created_at: now,
    updated_at: now,
  },
  created_at: now,
  updated_at: now,
};

const region: TextRegionRead = {
  id: "region-editor-1",
  page_id: page.id,
  region_index: 1,
  region_type: "speech",
  bounding_box: { x: 10, y: 20, width: 80, height: 60 },
  polygon: null,
  detected_text: "source text",
  detected_language: "ja",
  translated_text: "Machine translation",
  user_text: null,
  ocr_confidence: 0.9,
  translation_confidence: 0.85,
  render_style: { fontSize: 24, textColor: "#111111" },
  editable: true,
  status: "translated",
  failure_reason: null,
  created_at: now,
  updated_at: now,
};

const secondProject: ProjectDetail = {
  ...project,
  id: "project-editor-2",
  name: "Second Editor Project",
  status: "processing",
};

const secondPage: PageRead = {
  ...page,
  id: "page-editor-2",
  project_id: secondProject.id,
  original_asset_id: "asset-original-2",
  final_asset_id: "asset-final-2",
  original_asset: page.original_asset ? { ...page.original_asset, id: "asset-original-2", project_id: secondProject.id, page_id: "page-editor-2" } : null,
  final_asset: page.final_asset ? { ...page.final_asset, id: "asset-final-2", project_id: secondProject.id, page_id: "page-editor-2" } : null,
};

const secondRegion: TextRegionRead = {
  ...region,
  id: "region-editor-second",
  page_id: secondPage.id,
  translated_text: "Second project translation",
};

const job: ProcessingJobRead = {
  id: "job-editor-1",
  project_id: project.id,
  page_id: page.id,
  region_id: region.id,
  job_type: "retranslate_region",
  status: "succeeded",
  progress: 100,
  stage: "complete",
  error_code: null,
  error_message: null,
  attempts: 1,
  max_attempts: 3,
  celery_task_id: null,
  result: null,
  started_at: now,
  completed_at: now,
  created_at: now,
  updated_at: now,
};

const originalSetPointerCapture = HTMLElement.prototype.setPointerCapture;
const originalReleasePointerCapture = HTMLElement.prototype.releasePointerCapture;
const originalHasPointerCapture = HTMLElement.prototype.hasPointerCapture;
let currentRegions: TextRegionRead[];
let updateCount: number;

function applyRegionUpdate(regionId: string, payload: TextRegionUpdate): TextRegionRead {
  const existingRegion = currentRegions.find((item) => item.id === regionId) ?? region;
  const updatedRegion: TextRegionRead = {
    ...existingRegion,
    id: regionId,
    detected_text: "detected_text" in payload ? payload.detected_text ?? null : existingRegion.detected_text,
    user_text: "user_text" in payload ? payload.user_text ?? null : existingRegion.user_text,
    translated_text: "translated_text" in payload ? payload.translated_text ?? null : existingRegion.translated_text,
    render_style: "render_style" in payload ? payload.render_style ?? null : existingRegion.render_style,
    editable: "editable" in payload ? payload.editable ?? existingRegion.editable : existingRegion.editable,
    bounding_box: payload.bounding_box ?? existingRegion.bounding_box,
    status:
      payload.user_text !== undefined ||
      payload.translated_text !== undefined ||
      payload.bounding_box !== undefined ||
      payload.render_style !== undefined
        ? "user_edited"
        : payload.detected_text !== undefined
          ? payload.detected_text?.trim()
            ? "detected"
            : "needs_review"
          : existingRegion.status,
    updated_at: new Date(Date.parse(now) + ++updateCount * 1000).toISOString(),
  };
  currentRegions = currentRegions.map((item) => (item.id === regionId ? updatedRegion : item));
  return updatedRegion;
}

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

function firePointerEvent(target: Element, type: string, properties: Record<string, number>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(
    event,
    Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, { configurable: true, value }])),
  );
  fireEvent(target, event);
}

function renderEditor({
  initialEntries = [`/projects/${project.id}/editor`],
  initialIndex,
}: {
  initialEntries?: string[];
  initialIndex?: number;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/projects" element={<h1>Projects</h1>} />
          <Route path="/projects/:projectId/review" element={<h1>Review Page</h1>} />
          <Route path="/projects/:projectId/editor" element={<Editor />} />
          <Route path="/projects/:projectId/export" element={<h1>Export Page</h1>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("Editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 600,
      right: 800,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      paddingLeft: "0px",
      paddingRight: "0px",
      paddingTop: "0px",
      paddingBottom: "0px",
      getPropertyValue: () => "0px",
    } as unknown as CSSStyleDeclaration);
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
    currentRegions = [region];
    updateCount = 0;

    mocks.api.listProjects.mockResolvedValue([project]);
    mocks.api.getProject.mockResolvedValue(project);
    mocks.api.listPages.mockResolvedValue([page]);
    mocks.api.listRegions.mockImplementation(() => Promise.resolve(currentRegions));
    mocks.api.createRegion.mockImplementation((pageId: string, payload: TextRegionCreate) => {
      const createdRegion: TextRegionRead = {
        ...region,
        id: "region-editor-2",
        page_id: pageId,
        region_index: currentRegions.length + 1,
        region_type: payload.region_type ?? "unknown",
        bounding_box: payload.bounding_box,
        detected_text: payload.detected_text ?? null,
        translated_text: payload.translated_text ?? null,
        user_text: payload.user_text ?? null,
        ocr_confidence: null,
        translation_confidence: null,
        render_style: payload.render_style ?? null,
        status: payload.user_text?.trim() ? "user_edited" : payload.detected_text?.trim() ? "detected" : "needs_review",
        created_at: now,
        updated_at: new Date(Date.parse(now) + ++updateCount * 1000).toISOString(),
      };
      currentRegions = [...currentRegions, createdRegion];
      return Promise.resolve(createdRegion);
    });
    mocks.api.updateRegion.mockImplementation((regionId: string, payload: TextRegionUpdate) => Promise.resolve(applyRegionUpdate(regionId, payload)));
    mocks.api.deleteRegion.mockResolvedValue({ ...job, job_type: "rerender_page" });
    mocks.api.ocrRegion.mockResolvedValue({ ...job, job_type: "ocr_region" });
    mocks.api.retranslateRegion.mockResolvedValue(job);
    mocks.api.getProcessingJob.mockResolvedValue(job);
    mocks.waitForSuccessfulOcrJob.mockResolvedValue({ ...job, job_type: "ocr_region" });
    mocks.waitForSuccessfulRetranslateJob.mockResolvedValue(job);
  });

  afterEach(() => {
    HTMLElement.prototype.setPointerCapture = originalSetPointerCapture;
    HTMLElement.prototype.releasePointerCapture = originalReleasePointerCapture;
    HTMLElement.prototype.hasPointerCapture = originalHasPointerCapture;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders editor controls and saves the workspace", async () => {
    renderEditor();

    expect(await screen.findByText(project.name)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /undo/i })).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(screen.getByRole("button", { name: /compare split/i }));
    expect(screen.getByRole("button", { name: /compare split/i })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /^original$/i }));
    expect(screen.getByRole("button", { name: /^original$/i })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));
    expect(screen.getAllByText("115%").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /reset view/i }));
    expect(screen.getByText(/View reset/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /save workspace/i }));

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledWith(region.id, { auto_rerender: true });
    });
    expect(await screen.findByText(/Saved/)).toBeInTheDocument();
  });

  it("persists selected style drafts when saving the workspace", async () => {
    renderEditor();
    await screen.findByText(project.name);
    await screen.findByDisplayValue("Machine translation");

    fireEvent.change(screen.getByLabelText("Text size"), { target: { value: "32" } });
    await waitFor(() => {
      expect(screen.getByLabelText("Text size")).toHaveValue("32");
    });
    fireEvent.click(screen.getByRole("button", { name: /save workspace/i }));

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledWith(
        region.id,
        expect.objectContaining({
          render_style: expect.objectContaining({ fontSize: 32 }),
          auto_rerender: true,
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /undo/i })).not.toHaveAttribute("aria-disabled", "true");
    });

    fireEvent.click(screen.getByRole("button", { name: /undo/i }));

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledTimes(2);
    });
    expect(mocks.api.updateRegion.mock.calls.at(-1)).toEqual([
      region.id,
      {
        render_style: region.render_style,
        auto_rerender: true,
      },
    ]);
    expect(await screen.findByText(/Undo applied/)).toBeInTheDocument();
    expect(screen.getByLabelText("Text size")).toHaveValue("24");
  });

  it("blocks export navigation while style drafts are unsaved", async () => {
    renderEditor();
    await screen.findByText(project.name);
    await screen.findByDisplayValue("Machine translation");

    fireEvent.change(screen.getByLabelText("Fill opacity"), { target: { value: "0.35" } });
    fireEvent.change(screen.getByLabelText("Text size"), { target: { value: "48" } });
    fireEvent.click(screen.getByRole("link", { name: /export/i }));

    expect(screen.queryByRole("heading", { name: /export page/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Save or approve pending region edits before exporting/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledWith(
        region.id,
        expect.objectContaining({
          render_style: expect.objectContaining({ fillOpacity: 0.35, fontSize: 48 }),
          auto_rerender: true,
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getAllByText(/Saved/).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("link", { name: /export/i }));
    expect(await screen.findByRole("heading", { name: /export page/i })).toBeInTheDocument();
  });

  it("saves text and style drafts through Save workspace before export", async () => {
    renderEditor();
    await screen.findByText(project.name);

    fireEvent.change(await screen.findByDisplayValue("Machine translation"), {
      target: { value: "Workspace saved translation" },
    });
    fireEvent.change(screen.getByLabelText("Fill opacity"), { target: { value: "0.4" } });
    fireEvent.click(screen.getByRole("button", { name: /save workspace/i }));

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledWith(
        region.id,
        expect.objectContaining({
          user_text: "Workspace saved translation",
          render_style: expect.objectContaining({ fillOpacity: 0.4 }),
          auto_rerender: true,
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getAllByText(/Saved/).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("link", { name: /export/i }));
    expect(await screen.findByRole("heading", { name: /export page/i })).toBeInTheDocument();
  });

  it("routes Back to the project review fallback when no editor history is available", async () => {
    renderEditor();
    await screen.findByText(project.name);

    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(await screen.findByRole("heading", { name: /review page/i })).toBeInTheDocument();
  });

  it("uses router history for Back when the editor has an entry path", async () => {
    renderEditor({
      initialEntries: ["/projects", `/projects/${project.id}/editor`],
      initialIndex: 1,
    });
    await screen.findByText(project.name);

    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(await screen.findByRole("heading", { name: /projects/i })).toBeInTheDocument();
  });

  it("clears undo history when navigating to a different editor project", async () => {
    function ProjectSwitcher() {
      const navigate = useNavigate();
      return (
        <>
          <button type="button" onClick={() => navigate(`/projects/${secondProject.id}/editor`)}>
            Open second project
          </button>
          <Routes>
            <Route path="/projects/:projectId/editor" element={<Editor />} />
          </Routes>
        </>
      );
    }

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    mocks.api.getProject.mockImplementation((projectId: string) => Promise.resolve(projectId === secondProject.id ? secondProject : project));
    mocks.api.listPages.mockImplementation((projectId: string) => Promise.resolve(projectId === secondProject.id ? [secondPage] : [page]));
    mocks.api.listRegions.mockImplementation((pageId: string) => Promise.resolve(pageId === secondPage.id ? [secondRegion] : currentRegions));

    render(
      <MemoryRouter initialEntries={[`/projects/${project.id}/editor`]}>
        <QueryClientProvider client={queryClient}>
          <ProjectSwitcher />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await screen.findByText(project.name);

    fireEvent.change(await screen.findByDisplayValue("Machine translation"), {
      target: { value: "Human edited translation" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /undo/i })).not.toHaveAttribute("aria-disabled", "true");
    });

    fireEvent.click(screen.getByRole("button", { name: /open second project/i }));

    expect(await screen.findByText(secondProject.name)).toBeInTheDocument();
    await screen.findByDisplayValue("Second project translation");
    expect(screen.getByRole("button", { name: /undo/i })).toHaveAttribute("aria-disabled", "true");
  });

  it("saves and approves selected region edits", async () => {
    renderEditor();
    await screen.findByText(project.name);

    const targetDraft = await screen.findByDisplayValue("Machine translation");
    fireEvent.change(targetDraft, { target: { value: "Human edited translation" } });
    expect(targetDraft).toHaveValue("Human edited translation");
    fireEvent.change(screen.getByLabelText("Text size"), { target: { value: "32" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledWith(
        region.id,
        expect.objectContaining({
          user_text: "Human edited translation",
          render_style: expect.objectContaining({ fontSize: 32 }),
          auto_rerender: true,
        }),
      );
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledWith(
        region.id,
        expect.objectContaining({
          editable: false,
          auto_rerender: true,
        }),
      );
    });
  });

  it("undoes saved target text and style changes", async () => {
    renderEditor();
    await screen.findByText(project.name);

    fireEvent.change(await screen.findByDisplayValue("Machine translation"), {
      target: { value: "Human edited translation" },
    });
    fireEvent.change(screen.getByLabelText("Text size"), { target: { value: "32" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledWith(
        region.id,
        expect.objectContaining({
          user_text: "Human edited translation",
          render_style: expect.objectContaining({ fontSize: 32 }),
          auto_rerender: true,
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /undo/i })).not.toHaveAttribute("aria-disabled", "true");
    });

    fireEvent.click(screen.getByRole("button", { name: /undo/i }));

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledTimes(2);
    });
    expect(mocks.api.updateRegion.mock.calls.at(-1)).toEqual([
      region.id,
      {
        user_text: null,
        render_style: region.render_style,
        auto_rerender: true,
      },
    ]);
    expect(await screen.findByText(/Undo applied/)).toBeInTheDocument();
    expect(screen.getByLabelText(/target/i)).toHaveValue("Machine translation");
    expect(screen.getByRole("button", { name: /undo/i })).toHaveAttribute("aria-disabled", "true");
  });

  it("undoes approval without resending unchanged text or style fields", async () => {
    currentRegions = [{ ...region, user_text: "Machine translation" }];
    renderEditor();
    await screen.findByText(project.name);
    await screen.findByDisplayValue("Machine translation");

    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledWith(
        region.id,
        expect.objectContaining({
          editable: false,
          auto_rerender: true,
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /undo/i })).not.toHaveAttribute("aria-disabled", "true");
    });

    fireEvent.click(screen.getByRole("button", { name: /undo/i }));

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledTimes(2);
    });
    expect(mocks.api.updateRegion.mock.calls.at(-1)).toEqual([region.id, { editable: true }]);
    expect(await screen.findByText(/Undo applied/)).toBeInTheDocument();
  });

  it("surfaces undo failures in the editor status area", async () => {
    renderEditor();
    await screen.findByText(project.name);

    fireEvent.change(await screen.findByDisplayValue("Machine translation"), {
      target: { value: "Human edited translation" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledWith(
        region.id,
        expect.objectContaining({
          user_text: "Human edited translation",
          auto_rerender: true,
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /undo/i })).not.toHaveAttribute("aria-disabled", "true");
    });
    mocks.api.updateRegion.mockRejectedValueOnce(new Error("undo write failed"));

    fireEvent.click(screen.getByRole("button", { name: /undo/i }));

    expect(await screen.findByText(/Undo failed: undo write failed/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /undo/i })).not.toHaveAttribute("aria-disabled", "true");
    });
  });

  it("restores unsaved style drafts when a style undo fails", async () => {
    renderEditor();
    await screen.findByText(project.name);
    await screen.findByDisplayValue("Machine translation");

    fireEvent.change(screen.getByLabelText("Text size"), { target: { value: "32" } });
    await waitFor(() => {
      expect(screen.getByLabelText("Text size")).toHaveValue("32");
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledWith(
        region.id,
        expect.objectContaining({
          render_style: expect.objectContaining({ fontSize: 32 }),
          auto_rerender: true,
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /undo/i })).not.toHaveAttribute("aria-disabled", "true");
    });

    fireEvent.change(screen.getByLabelText("Text size"), { target: { value: "40" } });
    await waitFor(() => {
      expect(screen.getByLabelText("Text size")).toHaveValue("40");
    });
    mocks.api.updateRegion.mockRejectedValueOnce(new Error("undo write failed"));

    fireEvent.click(screen.getByRole("button", { name: /undo/i }));

    expect(await screen.findByText(/Undo failed: undo write failed/)).toBeInTheDocument();
    expect(screen.getByLabelText("Text size")).toHaveValue("40");
  });

  it("creates a manual text box from canvas add mode and selects it", async () => {
    renderEditor();
    await screen.findByText(project.name);

    const addTextBox = screen.getByRole("button", { name: /add text box/i });
    fireEvent.click(addTextBox);
    expect(addTextBox).toHaveAttribute("aria-pressed", "true");

    const canvasFrame = screen.getByTestId("canvas-frame");
    firePointerEvent(canvasFrame, "pointerdown", { pointerId: 1, button: 0, clientX: 100, clientY: 120 });
    firePointerEvent(canvasFrame, "pointermove", { pointerId: 1, clientX: 300, clientY: 260 });
    firePointerEvent(canvasFrame, "pointerup", { pointerId: 1, clientX: 300, clientY: 260 });

    await waitFor(() => {
      expect(mocks.api.createRegion).toHaveBeenCalledWith(
        page.id,
        expect.objectContaining({
          region_type: "unknown",
          bounding_box: expect.objectContaining({
            x: expect.any(Number),
            y: expect.any(Number),
            width: expect.any(Number),
            height: expect.any(Number),
          }),
        }),
      );
    });
    expect(await screen.findByText(/#2 Unknown/)).toBeInTheDocument();
    expect(addTextBox).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/Text box added/)).toBeInTheDocument();

    const targetDraft = screen.getByLabelText(/target/i);
    expect(targetDraft).toHaveValue("");
    fireEvent.change(targetDraft, { target: { value: "Manual caption" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledWith(
        "region-editor-2",
        expect.objectContaining({
          user_text: "Manual caption",
          auto_rerender: true,
        }),
      );
    });
  });

  it("surfaces region save failures without marking the workspace saved", async () => {
    mocks.api.updateRegion.mockRejectedValueOnce(new Error("write failed"));
    renderEditor();
    await screen.findByText(project.name);

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Save failed: write failed");
    expect(screen.getByText(/Unsaved/)).toBeInTheDocument();
  });

  it("creates and selects a highlighted OCR region from the canvas", async () => {
    renderEditor();
    await screen.findByText(project.name);

    fireEvent.click(screen.getByRole("button", { name: /highlight ocr region/i }));
    expect(screen.getByRole("button", { name: /^original$/i })).toHaveAttribute("aria-pressed", "true");
    const canvasFrame = screen.getByTestId("canvas-frame");
    firePointerEvent(canvasFrame, "pointerdown", { pointerId: 5, button: 0, clientX: 120, clientY: 120 });
    firePointerEvent(canvasFrame, "pointermove", { pointerId: 5, clientX: 320, clientY: 260 });
    firePointerEvent(canvasFrame, "pointerup", { pointerId: 5, clientX: 320, clientY: 260 });

    await waitFor(() => {
      expect(mocks.api.createRegion).toHaveBeenCalledWith(
        page.id,
        expect.objectContaining({
          bounding_box: expect.objectContaining({
            x: expect.any(Number),
            y: expect.any(Number),
            width: expect.any(Number),
            height: expect.any(Number),
          }),
          region_type: "unknown",
        }),
      );
    });
    expect(await screen.findByText(/OCR region highlighted/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^translated$/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("runs OCR and translates source text with project language context", async () => {
    renderEditor();
    await screen.findByText(project.name);

    fireEvent.click(screen.getByRole("button", { name: /run ocr/i }));

    await waitFor(() => {
      expect(mocks.api.ocrRegion).toHaveBeenCalledWith(region.id);
    });
    expect(mocks.waitForSuccessfulOcrJob).toHaveBeenCalledWith(expect.objectContaining({ job_type: "ocr_region" }), {
      getProcessingJob: mocks.api.getProcessingJob,
    });
    expect(await screen.findByText("OCR text updated.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/source/i), { target: { value: "manual source" } });
    fireEvent.click(screen.getByRole("button", { name: /translate region/i }));

    await waitFor(() => {
      expect(mocks.api.retranslateRegion).toHaveBeenCalledWith(region.id, {
        source_text: "manual source",
        target_language: "en",
        tone: "natural",
      });
    });
    expect(mocks.waitForSuccessfulRetranslateJob).toHaveBeenCalledWith(job, { getProcessingJob: mocks.api.getProcessingJob });
    expect(await screen.findByText("Translation updated.")).toBeInTheDocument();
  });

  it("refreshes region data after OCR failure updates backend region state", async () => {
    mocks.waitForSuccessfulOcrJob.mockRejectedValueOnce(new Error("No text detected in the selected region."));
    renderEditor();
    await screen.findByText(project.name);

    fireEvent.click(screen.getByRole("button", { name: /run ocr/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("OCR failed: No text detected in the selected region.");
    await waitFor(() => {
      expect(mocks.api.listRegions).toHaveBeenCalledTimes(2);
    });
  });

  it("refreshes region data after translation failure updates backend region state", async () => {
    mocks.waitForSuccessfulRetranslateJob.mockRejectedValueOnce(new Error("Translation provider rejected the request."));
    renderEditor();
    await screen.findByText(project.name);

    const translateButton = screen.getByRole("button", { name: /translate region/i });
    await waitFor(() => {
      expect(translateButton).not.toBeDisabled();
    });
    fireEvent.click(translateButton);

    await waitFor(() => {
      expect(mocks.waitForSuccessfulRetranslateJob).toHaveBeenCalled();
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Translation failed: Translation provider rejected the request.");
    await waitFor(() => {
      expect(mocks.api.listRegions).toHaveBeenCalledTimes(2);
    });
  });

  it("recovers region editing and retry after retranslate polling times out", async () => {
    const timeoutError = new Error(mocks.retranslateTimeoutMessage);
    timeoutError.name = "RetranslateJobPollingTimeoutError";
    mocks.waitForSuccessfulRetranslateJob.mockRejectedValueOnce(timeoutError).mockResolvedValueOnce(job);

    renderEditor();
    await screen.findByText(project.name);

    fireEvent.change(screen.getByLabelText(/source/i), { target: { value: "source text" } });
    fireEvent.click(screen.getByRole("button", { name: /translate region/i }));

    await waitFor(() => expect(mocks.waitForSuccessfulRetranslateJob).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toHaveTextContent(mocks.retranslateTimeoutMessage);
    expect(screen.queryByText(/Translation failed:/)).not.toBeInTheDocument();
    expect(screen.getByText(/Translation still running/)).toBeInTheDocument();
    expect(screen.getByLabelText(/target/i)).not.toBeDisabled();

    const retryButton = screen.getByRole("button", { name: /translate region/i });
    expect(retryButton).not.toBeDisabled();
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(mocks.api.retranslateRegion).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("Translation updated.")).toBeInTheDocument();
  });

  it("undoes persisted canvas region moves", async () => {
    renderEditor();
    await screen.findByText(project.name);

    const regionOverlay = screen.getByTitle("Region 1");
    firePointerEvent(regionOverlay, "pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    firePointerEvent(regionOverlay, "pointermove", { pointerId: 1, clientX: 140, clientY: 130 });
    firePointerEvent(regionOverlay, "pointerup", { pointerId: 1, clientX: 140, clientY: 130 });

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledWith(
        region.id,
        expect.objectContaining({
          bounding_box: expect.not.objectContaining(region.bounding_box),
          auto_rerender: true,
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /undo/i })).not.toHaveAttribute("aria-disabled", "true");
    });

    fireEvent.click(screen.getByRole("button", { name: /undo/i }));

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledTimes(2);
    });
    expect(mocks.api.updateRegion.mock.calls.at(-1)).toEqual([
      region.id,
      {
        bounding_box: region.bounding_box,
        auto_rerender: true,
      },
    ]);
    expect(await screen.findByText(/Undo applied/)).toBeInTheDocument();
  });

  it("preserves undo action order when overlapping save and move requests resolve out of order", async () => {
    const pendingUpdates: Array<{
      regionId: string;
      payload: TextRegionUpdate;
      resolve: (region: TextRegionRead) => void;
    }> = [];
    mocks.api.updateRegion.mockImplementation(
      (regionId: string, payload: TextRegionUpdate) =>
        new Promise<TextRegionRead>((resolve) => {
          pendingUpdates.push({ regionId, payload, resolve });
        }),
    );
    renderEditor();
    await screen.findByText(project.name);

    fireEvent.change(await screen.findByDisplayValue("Machine translation"), {
      target: { value: "Human edited translation" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledTimes(1);
    });

    const regionOverlay = screen.getByTitle("Region 1");
    firePointerEvent(regionOverlay, "pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    firePointerEvent(regionOverlay, "pointermove", { pointerId: 1, clientX: 140, clientY: 130 });
    firePointerEvent(regionOverlay, "pointerup", { pointerId: 1, clientX: 140, clientY: 130 });

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledTimes(2);
    });
    expect(pendingUpdates[0].payload).toEqual(expect.objectContaining({ user_text: "Human edited translation" }));
    expect(pendingUpdates[1].payload).toEqual(expect.objectContaining({ bounding_box: expect.not.objectContaining(region.bounding_box) }));

    await act(async () => {
      pendingUpdates[1].resolve(applyRegionUpdate(pendingUpdates[1].regionId, pendingUpdates[1].payload));
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /undo/i })).not.toHaveAttribute("aria-disabled", "true");
    });

    await act(async () => {
      pendingUpdates[0].resolve(applyRegionUpdate(pendingUpdates[0].regionId, pendingUpdates[0].payload));
    });
    await screen.findByText("Saved");

    fireEvent.click(screen.getByRole("button", { name: /undo/i }));

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledTimes(3);
    });
    expect(mocks.api.updateRegion.mock.calls.at(-1)).toEqual([
      region.id,
      {
        bounding_box: region.bounding_box,
        auto_rerender: true,
      },
    ]);
  });

  it("preserves unsaved style drafts when undoing canvas moves", async () => {
    renderEditor();
    await screen.findByText(project.name);
    await screen.findByDisplayValue("Machine translation");

    const textSize = screen.getByLabelText("Text size");
    fireEvent.change(textSize, { target: { value: "32" } });
    await waitFor(() => {
      expect(screen.getByLabelText("Text size")).toHaveValue("32");
    });

    const regionOverlay = screen.getByTitle("Region 1");
    firePointerEvent(regionOverlay, "pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    firePointerEvent(regionOverlay, "pointermove", { pointerId: 1, clientX: 140, clientY: 130 });
    firePointerEvent(regionOverlay, "pointerup", { pointerId: 1, clientX: 140, clientY: 130 });

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledWith(
        region.id,
        expect.objectContaining({
          bounding_box: expect.not.objectContaining(region.bounding_box),
          auto_rerender: true,
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /undo/i })).not.toHaveAttribute("aria-disabled", "true");
    });

    fireEvent.click(screen.getByRole("button", { name: /undo/i }));

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledTimes(2);
    });
    expect(mocks.api.updateRegion.mock.calls.at(-1)).toEqual([
      region.id,
      {
        bounding_box: region.bounding_box,
        auto_rerender: true,
      },
    ]);
    expect(await screen.findByText(/Undo applied/)).toBeInTheDocument();
    expect(screen.getByLabelText("Text size")).toHaveValue("32");
  });

  it("deletes selected regions and persists canvas region moves", async () => {
    renderEditor();
    await screen.findByText(project.name);

    fireEvent.click(screen.getAllByRole("button", { name: /^reject$/i }).at(-1)!);
    await waitFor(() => {
      expect(mocks.api.deleteRegion).toHaveBeenCalledWith(region.id);
    });

    const regionOverlay = screen.getByTitle("Region 1");
    firePointerEvent(regionOverlay, "pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    firePointerEvent(regionOverlay, "pointermove", { pointerId: 1, clientX: 140, clientY: 130 });
    firePointerEvent(regionOverlay, "pointerup", { pointerId: 1, clientX: 140, clientY: 130 });

    await waitFor(() => {
      expect(mocks.api.updateRegion).toHaveBeenCalledWith(
        region.id,
        expect.objectContaining({
          bounding_box: expect.objectContaining({
            x: expect.any(Number),
            y: expect.any(Number),
          }),
          auto_rerender: true,
        }),
      );
    });
  });
});
