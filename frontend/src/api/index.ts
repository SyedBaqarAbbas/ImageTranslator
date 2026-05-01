import { httpApi } from "./httpAdapter";
import { mockApi } from "./mockAdapter";
import type { ApiAdapter } from "../types/api";

export const api: ApiAdapter = import.meta.env.VITE_API_MODE === "http" ? httpApi : mockApi;

export const queryKeys = {
  runtimeLanguage: ["runtime-language"] as const,
  projects: ["projects"] as const,
  project: (projectId: string) => ["project", projectId] as const,
  pages: (projectId: string) => ["pages", projectId] as const,
  page: (projectId: string, pageId: string) => ["page", projectId, pageId] as const,
  regions: (pageId: string) => ["regions", pageId] as const,
  jobs: (projectId: string) => ["jobs", projectId] as const,
  exportJob: (exportJobId: string) => ["export-job", exportJobId] as const,
};
