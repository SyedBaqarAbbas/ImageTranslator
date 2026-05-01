import type {
  ApiAdapter,
  AssetRead,
  ExportJobRead,
  ExportRequest,
  PageRead,
  ProcessProjectRequest,
  ProcessingJobRead,
  ProjectCreate,
  ProjectDetail,
  ProjectRead,
  ProjectUpdate,
  RetranslateRequest,
  TextRegionRead,
  TextRegionUpdate,
  TranslationSettingsRead,
  TranslationSettingsUpdate,
} from "../types/api";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1").replace(/\/$/, "");

interface AssetDownload {
  url: string;
  expires_in: number;
}

const assetCache = new Map<string, Promise<AssetRead>>();

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const payload = (await response.json()) as {
        detail?: string | { message?: string };
        message?: string;
        error?: { message?: string; code?: string };
      };
      const detail = typeof payload.detail === "string" ? payload.detail : payload.detail?.message;
      message = detail ?? payload.message ?? payload.error?.message ?? payload.error?.code ?? message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

async function hydrateAsset(assetId: string | null | undefined, existing?: AssetRead | null): Promise<AssetRead | null> {
  const id = existing?.id ?? assetId;
  if (!id) {
    return existing ?? null;
  }

  if (existing?.url) {
    return existing;
  }

  const cached = assetCache.get(id);
  if (cached) {
    return cached;
  }

  const requestAsset = async () => {
    const asset = existing ?? (await request<AssetRead>(`/assets/${id}`));
    const download = await request<AssetDownload>(`/assets/${id}/download`);
    return { ...asset, url: download.url };
  };

  const promise = requestAsset().catch((error) => {
    assetCache.delete(id);
    throw error;
  });
  assetCache.set(id, promise);
  return promise;
}

async function hydratePage(page: PageRead): Promise<PageRead> {
  const [originalAsset, cleanedAsset, previewAsset, finalAsset] = await Promise.all([
    hydrateAsset(page.original_asset_id, page.original_asset),
    hydrateAsset(page.cleaned_asset_id, page.cleaned_asset),
    hydrateAsset(page.preview_asset_id, page.preview_asset),
    hydrateAsset(page.final_asset_id, page.final_asset),
  ]);

  return {
    ...page,
    original_asset: originalAsset,
    cleaned_asset: cleanedAsset,
    preview_asset: previewAsset,
    final_asset: finalAsset,
  };
}

async function hydratePages(pages: PageRead[]): Promise<PageRead[]> {
  return Promise.all(pages.map(hydratePage));
}

async function hydrateExportJob(job: ExportJobRead): Promise<ExportJobRead> {
  return {
    ...job,
    asset: await hydrateAsset(job.asset_id, job.asset),
  };
}

export const httpApi: ApiAdapter = {
  listProjects(): Promise<ProjectRead[]> {
    return request<ProjectRead[]>("/projects");
  },

  createProject(payload: ProjectCreate): Promise<ProjectDetail> {
    return request<ProjectDetail>("/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateProject(projectId: string, payload: ProjectUpdate): Promise<ProjectDetail> {
    return request<ProjectDetail>(`/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  updateSettings(projectId: string, payload: TranslationSettingsUpdate): Promise<TranslationSettingsRead> {
    return request<TranslationSettingsRead>(`/projects/${projectId}/settings`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  uploadPages(projectId: string, files: File[]): Promise<PageRead[]> {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    return request<PageRead[]>(`/projects/${projectId}/pages/upload`, {
      method: "POST",
      body: formData,
    }).then(hydratePages);
  },

  getProject(projectId: string): Promise<ProjectDetail> {
    return request<ProjectDetail>(`/projects/${projectId}`);
  },

  listPages(projectId: string): Promise<PageRead[]> {
    return request<PageRead[]>(`/projects/${projectId}/pages`).then(hydratePages);
  },

  getPage(projectId: string, pageId: string): Promise<PageRead> {
    void projectId;
    return request<PageRead>(`/pages/${pageId}`).then(hydratePage);
  },

  listRegions(pageId: string): Promise<TextRegionRead[]> {
    return request<TextRegionRead[]>(`/pages/${pageId}/regions`);
  },

  updateRegion(regionId: string, payload: TextRegionUpdate): Promise<TextRegionRead> {
    return request<TextRegionRead>(`/regions/${regionId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  deleteRegion(regionId: string): Promise<ProcessingJobRead> {
    return request<ProcessingJobRead>(`/regions/${regionId}`, {
      method: "DELETE",
    });
  },

  retranslateRegion(regionId: string, payload: RetranslateRequest): Promise<ProcessingJobRead> {
    return request<ProcessingJobRead>(`/regions/${regionId}/retranslate`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  processProject(projectId: string, payload: ProcessProjectRequest): Promise<ProcessingJobRead> {
    return request<ProcessingJobRead>(`/projects/${projectId}/process`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getProcessingJobs(projectId: string): Promise<ProcessingJobRead[]> {
    return request<ProcessingJobRead[]>(`/projects/${projectId}/jobs`);
  },

  createExport(projectId: string, payload: ExportRequest): Promise<ExportJobRead> {
    return request<ExportJobRead>(`/projects/${projectId}/export`, {
      method: "POST",
      body: JSON.stringify(payload),
    }).then(hydrateExportJob);
  },

  getExportJob(exportJobId: string): Promise<ExportJobRead> {
    return request<ExportJobRead>(`/exports/${exportJobId}`).then(hydrateExportJob);
  },
};
