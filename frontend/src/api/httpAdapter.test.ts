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
});
