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

  it("creates manual regions and reports completed OCR and retranslation jobs with updated region text", async () => {
    vi.useFakeTimers();
    const mockApi = await loadMockApi();
    const pages = await resolveDelayed(mockApi.listPages("project-cyber"));
    const regions = await resolveDelayed(mockApi.listRegions(pages[0].id));
    const manualRegion = await resolveDelayed(
      mockApi.createRegion(pages[0].id, {
        bounding_box: { x: 12, y: 24, width: 80, height: 60 },
      }),
    );

    expect(manualRegion).toMatchObject({
      page_id: pages[0].id,
      region_type: "unknown",
      status: "needs_review",
    });

    const ocrJob = await resolveDelayed(mockApi.ocrRegion(manualRegion.id));
    expect(ocrJob.status).toBe("queued");

    await vi.advanceTimersByTimeAsync(800);
    const completedOcrJob = await resolveDelayed(mockApi.getProcessingJob(ocrJob.id));
    const ocrRegions = await resolveDelayed(mockApi.listRegions(pages[0].id));

    expect(completedOcrJob).toMatchObject({ status: "succeeded", job_type: "ocr_region" });
    expect(ocrRegions.find((item) => item.id === manualRegion.id)?.detected_text).toBe("Manual OCR detected text");

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
    expect(updatedRegions.find((item) => item.id === regions[0].id)?.detected_text).toBe("Fresh source");
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
    const blankRegion = await resolveDelayed(
      mockApi.createRegion(pages[0].id, {
        bounding_box: { x: 12, y: 24, width: 120, height: 80 },
      }),
    );
    const manualRegion = await resolveDelayed(
      mockApi.createRegion(pages[0].id, {
        region_type: "caption",
        bounding_box: { x: 20, y: 30, width: 140, height: 90 },
        user_text: "Manual mock caption",
      }),
    );

    expect(blankRegion).toMatchObject({
      region_index: regions.length + 1,
      region_type: "unknown",
      status: "needs_review",
      user_text: null,
    });
    expect(manualRegion).toMatchObject({
      region_index: regions.length + 2,
      region_type: "caption",
      status: "user_edited",
      user_text: "Manual mock caption",
    });
    await expect(resolveDelayed(mockApi.listRegions(pages[0].id))).resolves.toHaveLength(regions.length + 2);

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
    const processedRegions = await resolveDelayed(mockApi.listRegions(pages[0].id));
    await resolveDelayed(
      mockApi.updateRegion(processedRegions[0].id, {
        user_text: "Styled export text",
        render_style: { fillOpacity: 0.35, fontSize: 48 },
        auto_rerender: true,
      }),
    );
    const successExport = await resolveDelayed(
      mockApi.createExport(project.id, {
        format: "images",
        include_originals: true,
        filename: "custom.images.zip",
      }),
    );
    await vi.advanceTimersByTimeAsync(1_700);
    const completedExport = await resolveDelayed(mockApi.getExportJob(successExport.id));
    expect(completedExport).toMatchObject({
      status: "succeeded",
      asset: expect.objectContaining({ filename: "custom.images.zip" }),
    });
    const exportPayload = decodeURIComponent(completedExport.asset?.url?.split(",", 2)[1] ?? "");
    expect(exportPayload).toContain("\"user_text\":\"Styled export text\"");
    expect(exportPayload).toContain("\"fillOpacity\":0.35");
    expect(exportPayload).toContain("\"fontSize\":48");
  });

  it("throws clear errors for missing mock resources", async () => {
    const mockApi = await loadMockApi();

    await expect(mockApi.getProject("missing")).rejects.toThrow("Project not found.");
    await expect(mockApi.listPages("missing")).rejects.toThrow("Project not found.");
    await expect(mockApi.getPage("project-cyber", "missing")).rejects.toThrow("Page not found.");
    await expect(mockApi.createRegion("missing-page", { bounding_box: { x: 1, y: 2, width: 3, height: 4 } })).rejects.toThrow(
      "Page not found.",
    );
    await expect(mockApi.listRegions("missing-page")).resolves.toEqual([]);
    await expect(mockApi.deleteRegion("missing-region")).rejects.toThrow("Text region not found.");
    await expect(mockApi.getProcessingJob("missing-job")).rejects.toThrow("Job not found.");
    await expect(mockApi.getExportJob("missing-export")).rejects.toThrow("Export job not found.");
  });
});
