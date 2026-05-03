import { afterEach, describe, expect, it, vi } from "vitest";

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

async function loadHttpApi() {
  vi.resetModules();
  vi.stubEnv("VITE_API_BASE_URL", "http://api.test/api/v1");
  const module = await import("./httpAdapter");
  return module.httpApi;
}

const asset = {
  id: "asset-1",
  user_id: "user-1",
  project_id: "project-1",
  page_id: "page-1",
  kind: "original",
  storage_backend: "local",
  bucket: null,
  key: "projects/project-1/original/page.png",
  filename: "page.png",
  content_type: "image/png",
  size_bytes: 100,
  checksum: null,
  width: 16,
  height: 16,
  created_at: "2026-04-27T00:00:00Z",
  updated_at: "2026-04-27T00:00:00Z",
};

const page = {
  id: "page-1",
  project_id: "project-1",
  page_number: 1,
  original_asset_id: "asset-1",
  processed_asset_id: null,
  cleaned_asset_id: null,
  preview_asset_id: null,
  final_asset_id: null,
  width: 16,
  height: 16,
  status: "uploaded",
  progress: 0,
  failure_reason: null,
  created_at: "2026-04-27T00:00:00Z",
  updated_at: "2026-04-27T00:00:00Z",
};

const cleanedAsset = {
  ...asset,
  id: "asset-cleaned-1",
  kind: "cleaned",
  key: "projects/project-1/processed/page-cleaned.png",
  filename: "page-cleaned.png",
};

describe("httpApi", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reads runtime language metadata from the backend", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "http://api.test/api/v1/runtime/language") {
        return jsonResponse({
          source_language: "ko",
          target_language: "en",
          provider: "opus_mt",
          locked: true,
          lock_message: "Ask a system administrator to change the language.",
        });
      }
      return jsonResponse({ error: { message: `Unexpected ${url}` } }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const httpApi = await loadHttpApi();
    const runtimeLanguage = await httpApi.getRuntimeLanguage();

    expect(runtimeLanguage.source_language).toBe("ko");
    expect(fetchMock).toHaveBeenCalledWith("http://api.test/api/v1/runtime/language", expect.any(Object));
  });

  it("uses backend page upload and hydrates asset download URLs", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "http://api.test/api/v1/projects/project-1/pages/upload") {
        return jsonResponse([page], { status: 201 });
      }
      if (url === "http://api.test/api/v1/assets/asset-1") {
        return jsonResponse(asset);
      }
      if (url === "http://api.test/api/v1/assets/asset-1/download") {
        return jsonResponse({ url: "http://api.test/api/v1/assets/by-key/page.png", expires_in: 900 });
      }
      return jsonResponse({ error: { message: `Unexpected ${url}` } }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const httpApi = await loadHttpApi();
    const uploaded = await httpApi.uploadPages("project-1", [
      new File(["image"], "page.png", { type: "image/png" }),
    ]);

    expect(uploaded[0].original_asset?.url).toBe("http://api.test/api/v1/assets/by-key/page.png");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/v1/projects/project-1/pages/upload",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("hydrates cleaned assets for editor-safe page backgrounds", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "http://api.test/api/v1/projects/project-1/pages") {
        return jsonResponse([{ ...page, cleaned_asset_id: "asset-cleaned-1" }]);
      }
      if (url === "http://api.test/api/v1/assets/asset-1") {
        return jsonResponse(asset);
      }
      if (url === "http://api.test/api/v1/assets/asset-1/download") {
        return jsonResponse({ url: "http://api.test/api/v1/assets/by-key/page.png", expires_in: 900 });
      }
      if (url === "http://api.test/api/v1/assets/asset-cleaned-1") {
        return jsonResponse(cleanedAsset);
      }
      if (url === "http://api.test/api/v1/assets/asset-cleaned-1/download") {
        return jsonResponse({ url: "http://api.test/api/v1/assets/by-key/page-cleaned.png", expires_in: 900 });
      }
      return jsonResponse({ error: { message: `Unexpected ${url}` } }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const httpApi = await loadHttpApi();
    const pages = await httpApi.listPages("project-1");

    expect(pages[0].cleaned_asset?.url).toBe("http://api.test/api/v1/assets/by-key/page-cleaned.png");
  });

  it("uses singular backend export path", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "http://api.test/api/v1/projects/project-1/export") {
        return jsonResponse({
          id: "export-1",
          user_id: "user-1",
          project_id: "project-1",
          format: "zip",
          status: "queued",
          progress: 0,
          asset_id: null,
          error_message: null,
          settings: null,
          started_at: null,
          completed_at: null,
          asset: null,
          created_at: "2026-04-27T00:00:00Z",
          updated_at: "2026-04-27T00:00:00Z",
        });
      }
      return jsonResponse({ error: { message: `Unexpected ${url}` } }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const httpApi = await loadHttpApi();
    await httpApi.createExport("project-1", {
      format: "zip",
      include_originals: false,
      filename: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/v1/projects/project-1/export",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses backend region delete path", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "http://api.test/api/v1/regions/region-1") {
        return jsonResponse({
          id: "job-1",
          project_id: "project-1",
          page_id: "page-1",
          region_id: null,
          job_type: "rerender_page",
          status: "succeeded",
          progress: 100,
          stage: "rerendering_page",
          error_code: null,
          error_message: null,
          attempts: 1,
          max_attempts: 3,
          celery_task_id: null,
          result: null,
          started_at: "2026-04-27T00:00:00Z",
          completed_at: "2026-04-27T00:00:00Z",
          created_at: "2026-04-27T00:00:00Z",
          updated_at: "2026-04-27T00:00:00Z",
        }, { status: 202 });
      }
      return jsonResponse({ error: { message: `Unexpected ${url}` } }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const httpApi = await loadHttpApi();
    await httpApi.deleteRegion("region-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/v1/regions/region-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("uses backend processing job lookup path", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "http://api.test/api/v1/jobs/job-1") {
        return jsonResponse({
          id: "job-1",
          project_id: "project-1",
          page_id: "page-1",
          region_id: "region-1",
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
          started_at: "2026-04-27T00:00:00Z",
          completed_at: "2026-04-27T00:00:00Z",
          created_at: "2026-04-27T00:00:00Z",
          updated_at: "2026-04-27T00:00:00Z",
        });
      }
      return jsonResponse({ error: { message: `Unexpected ${url}` } }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const httpApi = await loadHttpApi();
    await httpApi.getProcessingJob("job-1");

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/api/v1/jobs/job-1", expect.any(Object));
  });

  it("uses backend project delete path", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "http://api.test/api/v1/projects/project-1") {
        return new Response(null, { status: 204 });
      }
      return jsonResponse({ error: { message: `Unexpected ${url}` } }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const httpApi = await loadHttpApi();
    await httpApi.deleteProject("project-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/v1/projects/project-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("sends JSON contracts for project, settings, region, processing, and export lookups", async () => {
    const projectDetail = {
      id: "project-1",
      user_id: "user-1",
      name: "HTTP Project",
      description: null,
      source_language: "ja",
      target_language: "en",
      translation_tone: "natural",
      replacement_mode: "replace",
      reading_direction: "rtl",
      status: "ready",
      failure_reason: null,
      settings: null,
      created_at: "2026-04-27T00:00:00Z",
      updated_at: "2026-04-27T00:00:00Z",
    };
    const settings = {
      id: "settings-1",
      project_id: "project-1",
      source_language: "ja",
      target_language: "en",
      translation_tone: "formal",
      replacement_mode: "overlay",
      reading_direction: "rtl",
      preserve_sfx: true,
      bilingual: false,
      font_family: null,
      notes: null,
      created_at: "2026-04-27T00:00:00Z",
      updated_at: "2026-04-27T00:00:00Z",
    };
    const region = {
      id: "region-1",
      page_id: "page-1",
      region_index: 1,
      region_type: "speech",
      bounding_box: { x: 1, y: 2, width: 30, height: 40 },
      polygon: null,
      detected_text: "source",
      detected_language: "ja",
      translated_text: "target",
      user_text: null,
      ocr_confidence: 0.9,
      translation_confidence: 0.8,
      render_style: null,
      editable: true,
      status: "translated",
      failure_reason: null,
      created_at: "2026-04-27T00:00:00Z",
      updated_at: "2026-04-27T00:00:00Z",
    };
    const job = {
      id: "job-1",
      project_id: "project-1",
      page_id: "page-1",
      region_id: "region-1",
      job_type: "retranslate_region",
      status: "queued",
      progress: 0,
      stage: "queued",
      error_code: null,
      error_message: null,
      attempts: 0,
      max_attempts: 3,
      celery_task_id: null,
      result: null,
      started_at: null,
      completed_at: null,
      created_at: "2026-04-27T00:00:00Z",
      updated_at: "2026-04-27T00:00:00Z",
    };
    const exportJob = {
      id: "export-1",
      user_id: "user-1",
      project_id: "project-1",
      format: "zip",
      status: "succeeded",
      progress: 100,
      asset_id: "asset-1",
      error_message: null,
      settings: null,
      started_at: "2026-04-27T00:00:00Z",
      completed_at: "2026-04-27T00:00:00Z",
      asset: { ...asset, url: "http://cdn.test/export.zip" },
      created_at: "2026-04-27T00:00:00Z",
      updated_at: "2026-04-27T00:00:00Z",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "http://api.test/api/v1/projects" && method === "GET") {
        return jsonResponse([projectDetail]);
      }
      if (url === "http://api.test/api/v1/projects" && method === "POST") {
        return jsonResponse(projectDetail, { status: 201 });
      }
      if (url === "http://api.test/api/v1/projects/project-1") {
        return jsonResponse(projectDetail);
      }
      if (url === "http://api.test/api/v1/projects/project-1/settings") {
        return jsonResponse(settings);
      }
      if (url === "http://api.test/api/v1/pages/page-1") {
        return jsonResponse(page);
      }
      if (url === "http://api.test/api/v1/assets/asset-1") {
        return jsonResponse(asset);
      }
      if (url === "http://api.test/api/v1/assets/asset-1/download") {
        return jsonResponse({ url: "http://api.test/api/v1/assets/by-key/page.png", expires_in: 900 });
      }
      if (url === "http://api.test/api/v1/pages/page-1/regions") {
        return jsonResponse([region]);
      }
      if (url === "http://api.test/api/v1/regions/region-1") {
        return jsonResponse(region);
      }
      if (url === "http://api.test/api/v1/regions/region-1/retranslate") {
        return jsonResponse(job, { status: 202 });
      }
      if (url === "http://api.test/api/v1/projects/project-1/process") {
        return jsonResponse(job, { status: 202 });
      }
      if (url === "http://api.test/api/v1/projects/project-1/jobs") {
        return jsonResponse([job]);
      }
      if (url === "http://api.test/api/v1/exports/export-1") {
        return jsonResponse(exportJob);
      }
      return jsonResponse({ error: { message: `Unexpected ${url}` } }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const httpApi = await loadHttpApi();

    await expect(httpApi.listProjects()).resolves.toHaveLength(1);
    await expect(httpApi.createProject({
      name: "HTTP Project",
      source_language: "ja",
      target_language: "en",
      translation_tone: "natural",
      replacement_mode: "replace",
      reading_direction: "rtl",
    })).resolves.toMatchObject({ id: "project-1" });
    await expect(httpApi.updateProject("project-1", { name: "Renamed" })).resolves.toMatchObject({ id: "project-1" });
    await expect(httpApi.updateSettings("project-1", { translation_tone: "formal" })).resolves.toMatchObject({ id: "settings-1" });
    await expect(httpApi.getProject("project-1")).resolves.toMatchObject({ id: "project-1" });
    await expect(httpApi.getPage("project-1", "page-1")).resolves.toMatchObject({ id: "page-1" });
    await expect(httpApi.listRegions("page-1")).resolves.toHaveLength(1);
    await expect(httpApi.updateRegion("region-1", { user_text: "Human" })).resolves.toMatchObject({ id: "region-1" });
    await expect(httpApi.retranslateRegion("region-1", { source_text: "source" })).resolves.toMatchObject({ id: "job-1" });
    await expect(httpApi.processProject("project-1", { page_ids: ["page-1"], force: true })).resolves.toMatchObject({ id: "job-1" });
    await expect(httpApi.getProcessingJobs("project-1")).resolves.toHaveLength(1);
    await expect(httpApi.getExportJob("export-1")).resolves.toMatchObject({ asset: { url: "http://cdn.test/export.zip" } });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/v1/projects",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"name\":\"HTTP Project\""),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/v1/projects/project-1",
      expect.objectContaining({
        method: "PATCH",
        body: "{\"name\":\"Renamed\"}",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/v1/regions/region-1/retranslate",
      expect.objectContaining({
        method: "POST",
        body: "{\"source_text\":\"source\"}",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/v1/projects/project-1/process",
      expect.objectContaining({
        method: "POST",
        body: "{\"page_ids\":[\"page-1\"],\"force\":true}",
      }),
    );
  });

  it("extracts backend error shapes and retries failed asset hydration", async () => {
    let finalAssetDownloadAttempts = 0;
    const finalAsset = {
      ...asset,
      id: "asset-final-1",
      kind: "final",
      key: "projects/project-1/final/page.png",
      filename: "page-final.png",
    };
    const finalOnlyPage = {
      ...page,
      original_asset_id: null,
      final_asset_id: "asset-final-1",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "http://api.test/api/v1/projects/detail-error") {
        return jsonResponse({ detail: { message: "Nested detail failed" } }, { status: 400 });
      }
      if (url === "http://api.test/api/v1/projects/message-error") {
        return jsonResponse({ message: "Plain message failed" }, { status: 422 });
      }
      if (url === "http://api.test/api/v1/projects/code-error/settings") {
        return jsonResponse({ error: { code: "MissingProvider" } }, { status: 503 });
      }
      if (url === "http://api.test/api/v1/projects/status-error/jobs") {
        return new Response("temporarily down", { status: 502, statusText: "Bad Gateway" });
      }
      if (url === "http://api.test/api/v1/projects/project-1/pages") {
        return jsonResponse([finalOnlyPage]);
      }
      if (url === "http://api.test/api/v1/assets/asset-final-1") {
        return jsonResponse(finalAsset);
      }
      if (url === "http://api.test/api/v1/assets/asset-final-1/download") {
        finalAssetDownloadAttempts += 1;
        if (finalAssetDownloadAttempts === 1) {
          return jsonResponse({ error: { message: "Signed URL failed" } }, { status: 500 });
        }
        return jsonResponse({ url: "http://api.test/api/v1/assets/by-key/page-final.png", expires_in: 900 });
      }
      return jsonResponse({ error: { message: `Unexpected ${url}` } }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const httpApi = await loadHttpApi();

    await expect(httpApi.getProject("detail-error")).rejects.toThrow("Nested detail failed");
    await expect(httpApi.updateProject("message-error", { name: "Nope" })).rejects.toThrow("Plain message failed");
    await expect(httpApi.updateSettings("code-error", { target_language: "en" })).rejects.toThrow("MissingProvider");
    await expect(httpApi.getProcessingJobs("status-error")).rejects.toThrow("Bad Gateway");
    await expect(httpApi.listPages("project-1")).rejects.toThrow("Signed URL failed");
    await expect(httpApi.listPages("project-1")).resolves.toMatchObject([
      { final_asset: { url: "http://api.test/api/v1/assets/by-key/page-final.png" } },
    ]);

    expect(finalAssetDownloadAttempts).toBe(2);
  });
});
