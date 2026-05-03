import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PageRead, ProcessingJobRead, ProjectDetail, TextRegionRead, TextRegionUpdate } from "../types/api";
import { Editor } from "./Editor";

const mocks = vi.hoisted(() => ({
  api: {
    listProjects: vi.fn(),
    getProject: vi.fn(),
    listPages: vi.fn(),
    listRegions: vi.fn(),
    updateRegion: vi.fn(),
    deleteRegion: vi.fn(),
    retranslateRegion: vi.fn(),
    getProcessingJob: vi.fn(),
  },
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

function renderEditor() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <MemoryRouter initialEntries={[`/projects/${project.id}/editor`]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/projects/:projectId/editor" element={<Editor />} />
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

    mocks.api.listProjects.mockResolvedValue([project]);
    mocks.api.getProject.mockResolvedValue(project);
    mocks.api.listPages.mockResolvedValue([page]);
    mocks.api.listRegions.mockResolvedValue([region]);
    mocks.api.updateRegion.mockImplementation((regionId: string, payload: TextRegionUpdate) =>
      Promise.resolve({
        ...region,
        id: regionId,
        user_text: payload.user_text ?? region.user_text,
        render_style: payload.render_style ?? region.render_style,
        editable: payload.editable ?? region.editable,
        bounding_box: payload.bounding_box ?? region.bounding_box,
      }),
    );
    mocks.api.deleteRegion.mockResolvedValue({ ...job, job_type: "rerender_page" });
    mocks.api.retranslateRegion.mockResolvedValue(job);
    mocks.api.getProcessingJob.mockResolvedValue(job);
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
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");

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

  it("surfaces region save failures without marking the workspace saved", async () => {
    mocks.api.updateRegion.mockRejectedValueOnce(new Error("write failed"));
    renderEditor();
    await screen.findByText(project.name);

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Save failed: write failed");
    expect(screen.getByText(/Unsaved/)).toBeInTheDocument();
  });

  it("retranslates a region with project language context", async () => {
    renderEditor();
    await screen.findByText(project.name);

    fireEvent.click(screen.getByRole("button", { name: /retranslate region/i }));

    await waitFor(() => {
      expect(mocks.api.retranslateRegion).toHaveBeenCalledWith(region.id, {
        source_text: "source text",
        target_language: "en",
        tone: "natural",
      });
    });
    expect(mocks.waitForSuccessfulRetranslateJob).toHaveBeenCalledWith(job, { getProcessingJob: mocks.api.getProcessingJob });
    expect(await screen.findByRole("status")).toHaveTextContent("Translation updated.");
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
