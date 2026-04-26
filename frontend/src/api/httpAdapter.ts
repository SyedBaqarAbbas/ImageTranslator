import type {
  ApiAdapter,
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
const tokenStorageKey = import.meta.env.VITE_AUTH_TOKEN_KEY ?? "comicflow.accessToken";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = window.localStorage.getItem(tokenStorageKey);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string; message?: string; error?: { message?: string } };
      message = payload.detail ?? payload.message ?? payload.error?.message ?? message;
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
    return request<PageRead[]>(`/projects/${projectId}/pages`, {
      method: "POST",
      body: formData,
    });
  },

  getProject(projectId: string): Promise<ProjectDetail> {
    return request<ProjectDetail>(`/projects/${projectId}`);
  },

  listPages(projectId: string): Promise<PageRead[]> {
    return request<PageRead[]>(`/projects/${projectId}/pages`);
  },

  getPage(projectId: string, pageId: string): Promise<PageRead> {
    return request<PageRead>(`/projects/${projectId}/pages/${pageId}`);
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
    return request<ExportJobRead>(`/projects/${projectId}/exports`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getExportJob(exportJobId: string): Promise<ExportJobRead> {
    return request<ExportJobRead>(`/exports/${exportJobId}`);
  },
};
