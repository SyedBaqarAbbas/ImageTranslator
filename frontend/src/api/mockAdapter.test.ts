import { afterEach, describe, expect, it, vi } from "vitest";

async function loadMockApi() {
  vi.resetModules();
  const module = await import("./mockAdapter");
  return module.mockApi;
}

async function resolveDelayed<T>(promise: Promise<T>, ms = 180): Promise<T> {
  await vi.advanceTimersByTimeAsync(ms);
  return promise;
}

describe("mockApi", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns locked runtime language metadata", async () => {
    const mockApi = await loadMockApi();

    await expect(mockApi.getRuntimeLanguage()).resolves.toMatchObject({
      source_language: "auto",
      target_language: "en",
      locked: true,
      lock_message: "Ask a system administrator to change the language.",
    });
  });

  it("soft deletes projects and hides them from project reads", async () => {
    const mockApi = await loadMockApi();

    expect((await mockApi.listProjects()).some((project) => project.id === "project-cyber")).toBe(true);

    await mockApi.deleteProject("project-cyber");

    expect((await mockApi.listProjects()).some((project) => project.id === "project-cyber")).toBe(false);
    await expect(mockApi.getProject("project-cyber")).rejects.toThrow("Project not found.");
  });

  it("reports completed retranslation jobs with updated region text", async () => {
    vi.useFakeTimers();
    const mockApi = await loadMockApi();
    const pages = await resolveDelayed(mockApi.listPages("project-cyber"));
    const regions = await resolveDelayed(mockApi.listRegions(pages[0].id));

    const acceptedJob = await resolveDelayed(
      mockApi.retranslateRegion(regions[0].id, {
        source_text: "Fresh source",
      }),
    );

    expect(acceptedJob.status).toBe("queued");

    await vi.advanceTimersByTimeAsync(900);
    const completedJob = await resolveDelayed(mockApi.getProcessingJob(acceptedJob.id));
    const updatedRegions = await resolveDelayed(mockApi.listRegions(pages[0].id));

    expect(completedJob.status).toBe("succeeded");
    expect(updatedRegions.find((item) => item.id === regions[0].id)?.translated_text).toBe("Fresh source (AI polished)");
  });

  it("creates projects, uploads archive placeholders, processes pages, and manages settings", async () => {
    vi.useFakeTimers();
    const mockApi = await loadMockApi();

    const project = await resolveDelayed(
      mockApi.createProject({
        name: "Adapter Project",
        description: null,
        source_language: "ja",
        target_language: "en",
        translation_tone: "literal",
        replacement_mode: "bilingual",
        reading_direction: "ltr",
      }),
    );
    const settings = await resolveDelayed(
      mockApi.updateSettings(project.id, {
        source_language: "ko",
        replacement_mode: "overlay",
        reading_direction: "rtl",
        font_family: "Komika",
      }),
    );
    const pages = await resolveDelayed(
      mockApi.uploadPages(project.id, [new File(["archive"], "chapter.zip", { type: "application/zip" })]),
    );
    const queuedJob = await resolveDelayed(mockApi.processProject(project.id, { force: false }));

    expect(settings.source_language).toBe("ko");
    expect(settings.font_family).toBe("Komika");
    expect(pages[0].page_number).toBe(1);
    expect(pages[0].original_asset?.url).toContain("data:image/svg+xml");
    expect(queuedJob.status).toBe("queued");

    await vi.advanceTimersByTimeAsync(2_800);
    const completedJob = await resolveDelayed(mockApi.getProcessingJob(queuedJob.id));
    const processedPages = await resolveDelayed(mockApi.listPages(project.id));
    expect(completedJob).toMatchObject({ status: "succeeded", stage: "complete", progress: 100 });
    expect(processedPages[0]).toMatchObject({ status: "review_required", progress: 96 });
  });

  it("covers region deletion and export success and failure states", async () => {
    vi.useFakeTimers();
    const mockApi = await loadMockApi();
    const project = await resolveDelayed(
      mockApi.createProject({
        name: "Export Adapter Project",
        description: null,
        source_language: "ja",
        target_language: "en",
        translation_tone: "natural",
        replacement_mode: "replace",
        reading_direction: "rtl",
      }),
    );
    const emptyExport = await resolveDelayed(mockApi.createExport(project.id, { format: "zip", include_originals: false }));

    await vi.advanceTimersByTimeAsync(1_700);
    expect(await resolveDelayed(mockApi.getExportJob(emptyExport.id))).toMatchObject({
      status: "failed",
      error_message: expect.stringContaining("No pages are available"),
    });

    const pages = await resolveDelayed(
      mockApi.uploadPages(project.id, [new File(["page"], "page.png", { type: "text/plain" })]),
    );
    const regions = await resolveDelayed(mockApi.listRegions(pages[0].id));
    const deleteJob = await resolveDelayed(mockApi.deleteRegion(regions[0].id));
    await vi.advanceTimersByTimeAsync(500);
    expect(await resolveDelayed(mockApi.getProcessingJob(deleteJob.id))).toMatchObject({
      status: "succeeded",
      stage: "rerendered",
    });

    const noRenderedExport = await resolveDelayed(mockApi.createExport(project.id, { format: "pdf", include_originals: false }));
    await vi.advanceTimersByTimeAsync(1_700);
    expect(await resolveDelayed(mockApi.getExportJob(noRenderedExport.id))).toMatchObject({
      status: "failed",
      error_message: expect.stringContaining("No rendered pages"),
    });

    const processJob = await resolveDelayed(mockApi.processProject(project.id, { force: true }));
    await vi.advanceTimersByTimeAsync(2_800);
    await resolveDelayed(mockApi.getProcessingJob(processJob.id));
    const successExport = await resolveDelayed(
      mockApi.createExport(project.id, {
        format: "images",
        include_originals: true,
        filename: "custom.images.zip",
      }),
    );
    await vi.advanceTimersByTimeAsync(1_700);
    expect(await resolveDelayed(mockApi.getExportJob(successExport.id))).toMatchObject({
      status: "succeeded",
      asset: expect.objectContaining({ filename: "custom.images.zip" }),
    });
  });

  it("throws clear errors for missing mock resources", async () => {
    const mockApi = await loadMockApi();

    await expect(mockApi.getProject("missing")).rejects.toThrow("Project not found.");
    await expect(mockApi.listPages("missing")).rejects.toThrow("Project not found.");
    await expect(mockApi.getPage("project-cyber", "missing")).rejects.toThrow("Page not found.");
    await expect(mockApi.listRegions("missing-page")).resolves.toEqual([]);
    await expect(mockApi.deleteRegion("missing-region")).rejects.toThrow("Text region not found.");
    await expect(mockApi.getProcessingJob("missing-job")).rejects.toThrow("Job not found.");
    await expect(mockApi.getExportJob("missing-export")).rejects.toThrow("Export job not found.");
  });
});
