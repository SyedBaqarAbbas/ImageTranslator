import {
  comicPageDataUri,
  createAsset,
  iso,
  seedMockStore,
  type MockStore,
} from "../data/mockData";
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
  RuntimeLanguageRead,
  TextRegionRead,
  TextRegionUpdate,
  TranslationSettingsRead,
  TranslationSettingsUpdate,
} from "../types/api";

const store: MockStore = seedMockStore();
const jobs: ProcessingJobRead[] = [];
const exportsStore: ExportJobRead[] = [];

function clone<T>(value: T): T {
  return structuredClone(value);
}

function delay<T>(value: T, ms = 180): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(clone(value)), ms));
}

function id(prefix: string): string {
  if ("crypto" in window && "randomUUID" in window.crypto) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function exportFilename(projectName: string, format: ExportRequest["format"], requested?: string | null): string {
  const extension = format === "pdf" ? "pdf" : "zip";
  const base = (requested?.trim() || `${projectName.toLowerCase().replaceAll(" ", "-")}-translated`).replace(/\.+$/, "");
  return base.toLowerCase().endsWith(`.${extension}`) ? base : `${base}.${extension}`;
}

function findProject(projectId: string): ProjectDetail {
  const project = store.projects.find((item) => item.id === projectId && item.status !== "deleted");
  if (!project) {
    throw new Error("Project not found.");
  }
  return project;
}

function findRegion(regionId: string): TextRegionRead {
  const region = store.regions.find((item) => item.id === regionId);
  if (!region) {
    throw new Error("Text region not found.");
  }
  return region;
}

function findJob(jobId: string): ProcessingJobRead {
  const job = jobs.find((item) => item.id === jobId);
  if (!job) {
    throw new Error("Job not found.");
  }
  return job;
}

function buildJob(projectId: string, jobType: string, result: Record<string, unknown> | null = null): ProcessingJobRead {
  const now = iso();
  return {
    id: id("job"),
    project_id: projectId,
    page_id: null,
    region_id: null,
    job_type: jobType,
    status: "queued",
    progress: 0,
    stage: "queued",
    error_code: null,
    error_message: null,
    attempts: 0,
    max_attempts: 3,
    celery_task_id: null,
    result,
    started_at: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
  };
}

function scheduleProcessing(job: ProcessingJobRead): void {
  const project = findProject(job.project_id);
  const projectPages = store.pages.filter((page) => page.project_id === project.id);
  project.status = "processing";
  project.updated_at = iso();
  projectPages.forEach((page) => {
    page.status = "queued";
    page.progress = 5;
    page.updated_at = iso();
  });

  window.setTimeout(() => {
    job.status = "running";
    job.stage = "detecting_text";
    job.progress = 28;
    job.started_at = iso();
    job.updated_at = iso();
    projectPages.forEach((page) => {
      page.status = "ocr_running";
      page.progress = 35;
    });
  }, 700);

  window.setTimeout(() => {
    job.stage = "translating_regions";
    job.progress = 68;
    job.updated_at = iso();
    projectPages.forEach((page) => {
      page.status = "translating";
      page.progress = 70;
    });
  }, 1_600);

  window.setTimeout(() => {
    project.status = "review_required";
    project.updated_at = iso();
    projectPages.forEach((page) => {
      const pageAsset = page.original_asset ?? page.preview_asset;
      if (pageAsset) {
        page.preview_asset = { ...pageAsset, kind: "preview" };
        page.preview_asset_id = page.preview_asset.id;
      }
      page.status = "review_required";
      page.progress = 96;
      page.updated_at = iso();
    });
    job.status = "succeeded";
    job.stage = "complete";
    job.progress = 100;
    job.completed_at = iso();
    job.updated_at = iso();
  }, 2_700);
}

function ensureRegionsForPage(page: PageRead): void {
  if (store.regions.some((region) => region.page_id === page.id)) {
    return;
  }

  const now = iso();
  store.regions.push(
    {
      id: id("region"),
      page_id: page.id,
      region_index: 1,
      region_type: "speech",
      bounding_box: { x: 120, y: 128, width: 210, height: 112 },
      polygon: null,
      detected_text: "これは何?",
      detected_language: "ja",
      translated_text: "What is this?",
      user_text: null,
      ocr_confidence: 0.84,
      translation_confidence: 0.8,
      render_style: { fontSize: 25, fontFamily: "Anime Ace" },
      editable: true,
      status: "translated",
      failure_reason: null,
      created_at: now,
      updated_at: now,
    },
    {
      id: id("region"),
      page_id: page.id,
      region_index: 2,
      region_type: "sfx",
      bounding_box: { x: 580, y: 600, width: 210, height: 180 },
      polygon: null,
      detected_text: "ドン",
      detected_language: "ja",
      translated_text: "DOOM",
      user_text: null,
      ocr_confidence: 0.68,
      translation_confidence: 0.66,
      render_style: { fontSize: 34, fontFamily: "Anime Ace", uppercase: true },
      editable: true,
      status: "needs_review",
      failure_reason: null,
      created_at: now,
      updated_at: now,
    },
  );
}

export const mockApi: ApiAdapter = {
  async getRuntimeLanguage(): Promise<RuntimeLanguageRead> {
    return delay({
      source_language: "auto",
      target_language: "en",
      provider: "mock",
      locked: true,
      lock_message: "Ask a system administrator to change the language.",
    });
  },

  async listProjects(): Promise<ProjectRead[]> {
    return delay(store.projects.filter((project) => project.status !== "deleted"));
  },

  async createProject(payload: ProjectCreate): Promise<ProjectDetail> {
    const now = iso();
    const project: ProjectDetail = {
      id: id("project"),
      user_id: "mock-user-1",
      name: payload.name,
      description: payload.description ?? null,
      source_language: payload.source_language,
      target_language: payload.target_language,
      translation_tone: payload.translation_tone,
      replacement_mode: payload.replacement_mode,
      reading_direction: payload.reading_direction,
      status: "draft",
      failure_reason: null,
      settings: null,
      created_at: now,
      updated_at: now,
    };
    const settings: TranslationSettingsRead = {
      id: id("settings"),
      project_id: project.id,
      source_language: payload.source_language,
      target_language: payload.target_language,
      translation_tone: payload.translation_tone,
      replacement_mode: payload.replacement_mode,
      reading_direction: payload.reading_direction,
      preserve_sfx: true,
      bilingual: payload.replacement_mode === "bilingual",
      font_family: "Anime Ace",
      notes: null,
      created_at: now,
      updated_at: now,
    };
    project.settings = settings;
    store.projects.unshift(project);
    store.settings.push(settings);
    return delay(project);
  },

  async updateProject(projectId: string, payload: ProjectUpdate): Promise<ProjectDetail> {
    const project = findProject(projectId);
    Object.assign(project, payload, { updated_at: iso() });
    return delay(project);
  },

  async deleteProject(projectId: string): Promise<void> {
    const project = findProject(projectId);
    project.status = "deleted";
    project.updated_at = iso();
    await delay(undefined);
  },

  async updateSettings(projectId: string, payload: TranslationSettingsUpdate): Promise<TranslationSettingsRead> {
    const project = findProject(projectId);
    let settings = store.settings.find((item) => item.project_id === projectId);
    if (!settings) {
      settings = {
        id: id("settings"),
        project_id: projectId,
        source_language: project.source_language,
        target_language: project.target_language,
        translation_tone: project.translation_tone,
        replacement_mode: project.replacement_mode,
        reading_direction: project.reading_direction,
        preserve_sfx: true,
        bilingual: false,
        font_family: "Anime Ace",
        notes: null,
        created_at: iso(),
        updated_at: iso(),
      };
      store.settings.push(settings);
    }
    Object.assign(settings, payload, { updated_at: iso() });
    Object.assign(project, {
      source_language: settings.source_language,
      target_language: settings.target_language,
      translation_tone: settings.translation_tone,
      replacement_mode: settings.replacement_mode,
      reading_direction: settings.reading_direction,
      settings,
      updated_at: iso(),
    });
    return delay(settings);
  },

  async uploadPages(projectId: string, files: File[]): Promise<PageRead[]> {
    const project = findProject(projectId);
    project.status = "ready";
    project.updated_at = iso();
    const existingCount = store.pages.filter((page) => page.project_id === projectId).length;
    const pages = files.map((file, index) => {
      const pageId = id("page");
      const isImage = file.type.startsWith("image/");
      const asset = createAsset({
        id: id("asset"),
        projectId,
        pageId,
        kind: "original",
        filename: file.name || `page-${index + 1}.png`,
        url: isImage ? URL.createObjectURL(file) : comicPageDataUri(file.name || "UPLOADED PAGE"),
      });
      const now = iso();
      const page: PageRead = {
        id: pageId,
        project_id: projectId,
        page_number: existingCount + index + 1,
        original_asset_id: asset.id,
        processed_asset_id: null,
        cleaned_asset_id: null,
        preview_asset_id: null,
        final_asset_id: null,
        width: asset.width,
        height: asset.height,
        status: "uploaded",
        progress: 0,
        failure_reason: null,
        original_asset: asset,
        preview_asset: null,
        final_asset: null,
        created_at: now,
        updated_at: now,
      };
      ensureRegionsForPage(page);
      return page;
    });
    store.pages.push(...pages);
    return delay(pages);
  },

  async getProject(projectId: string): Promise<ProjectDetail> {
    return delay(findProject(projectId));
  },

  async listPages(projectId: string): Promise<PageRead[]> {
    findProject(projectId);
    return delay(store.pages.filter((page) => page.project_id === projectId).sort((a, b) => a.page_number - b.page_number));
  },

  async getPage(projectId: string, pageId: string): Promise<PageRead> {
    findProject(projectId);
    const page = store.pages.find((item) => item.id === pageId && item.project_id === projectId);
    if (!page) {
      throw new Error("Page not found.");
    }
    return delay(page);
  },

  async listRegions(pageId: string): Promise<TextRegionRead[]> {
    return delay(store.regions.filter((region) => region.page_id === pageId).sort((a, b) => a.region_index - b.region_index));
  },

  async updateRegion(regionId: string, payload: TextRegionUpdate): Promise<TextRegionRead> {
    const region = findRegion(regionId);
    Object.assign(region, payload, {
      status:
        payload.user_text !== undefined ||
        payload.translated_text !== undefined ||
        payload.bounding_box !== undefined ||
        payload.render_style !== undefined
          ? "user_edited"
          : region.status,
      updated_at: iso(),
    });
    return delay(region);
  },

  async deleteRegion(regionId: string): Promise<ProcessingJobRead> {
    const region = findRegion(regionId);
    const page = store.pages.find((item) => item.id === region.page_id);
    if (!page) {
      throw new Error("Page not found.");
    }
    store.regions = store.regions.filter((item) => item.id !== regionId);
    const job = buildJob(page.project_id, "rerender_page", { deleted_region_id: regionId });
    job.page_id = page.id;
    jobs.unshift(job);
    window.setTimeout(() => {
      job.status = "succeeded";
      job.progress = 100;
      job.stage = "rerendered";
      job.completed_at = iso();
      page.updated_at = iso();
    }, 400);
    return delay(job);
  },

  async retranslateRegion(regionId: string, payload: RetranslateRequest): Promise<ProcessingJobRead> {
    const region = findRegion(regionId);
    const page = store.pages.find((item) => item.id === region.page_id);
    if (!page) {
      throw new Error("Page not found.");
    }
    const job = buildJob(page.project_id, "retranslate_region", { ...payload });
    job.page_id = page.id;
    job.region_id = region.id;
    jobs.unshift(job);
    window.setTimeout(() => {
      job.status = "running";
      job.progress = 45;
      job.stage = "translating_region";
      job.started_at = iso();
      job.updated_at = iso();
      region.status = "translating";
      region.updated_at = iso();
    }, 300);
    window.setTimeout(() => {
      job.status = "succeeded";
      job.progress = 100;
      job.stage = "complete";
      job.completed_at = iso();
      job.updated_at = iso();
      region.translated_text = payload.source_text ? `${payload.source_text} (AI polished)` : `${region.translated_text ?? ""} (refined)`;
      region.translation_confidence = 0.91;
      region.status = "translated";
      region.updated_at = iso();
    }, 900);
    return delay(job);
  },

  async getProcessingJob(jobId: string): Promise<ProcessingJobRead> {
    return delay(findJob(jobId));
  },

  async processProject(projectId: string, payload: ProcessProjectRequest): Promise<ProcessingJobRead> {
    const job = buildJob(projectId, "process_project", payload as Record<string, unknown>);
    jobs.unshift(job);
    scheduleProcessing(job);
    return delay(job);
  },

  async getProcessingJobs(projectId: string): Promise<ProcessingJobRead[]> {
    findProject(projectId);
    return delay(jobs.filter((job) => job.project_id === projectId));
  },

  async createExport(projectId: string, payload: ExportRequest): Promise<ExportJobRead> {
    const project = findProject(projectId);
    const projectPages = store.pages.filter((page) => page.project_id === projectId);
    const renderedPages = projectPages.filter((page) => page.final_asset_id || page.preview_asset_id);
    const now = iso();
    const exportJob: ExportJobRead = {
      id: id("export"),
      user_id: project.user_id,
      project_id: projectId,
      format: payload.format,
      status: "queued",
      progress: 0,
      asset_id: null,
      error_message: null,
      settings: payload as unknown as Record<string, unknown>,
      started_at: null,
      completed_at: null,
      asset: null,
      created_at: now,
      updated_at: now,
    };
    exportsStore.unshift(exportJob);
    window.setTimeout(() => {
      exportJob.status = "running";
      exportJob.progress = 52;
      exportJob.started_at = iso();
      exportJob.updated_at = iso();
    }, 500);
    window.setTimeout(() => {
      if (projectPages.length === 0) {
        exportJob.status = "failed";
        exportJob.progress = 100;
        exportJob.error_message = "No pages are available to export. Upload at least one page, process it, then return to Export.";
        exportJob.completed_at = iso();
        exportJob.updated_at = iso();
        return;
      }
      if (renderedPages.length === 0) {
        exportJob.status = "failed";
        exportJob.progress = 100;
        exportJob.error_message = "No rendered pages were available to export. Process the project first, then return to Export.";
        exportJob.completed_at = iso();
        exportJob.updated_at = iso();
        return;
      }

      const asset = createAsset({
        id: id("asset"),
        projectId,
        kind: "export",
        filename: exportFilename(project.name, payload.format, payload.filename),
        url: `data:text/plain;charset=utf-8,${encodeURIComponent(`Mock ${payload.format.toUpperCase()} export for ${project.name}`)}`,
      });
      project.status = "export_ready";
      project.updated_at = iso();
      exportJob.status = "succeeded";
      exportJob.progress = 100;
      exportJob.asset_id = asset.id;
      exportJob.asset = asset;
      exportJob.completed_at = iso();
      exportJob.updated_at = iso();
    }, 1_600);
    return delay(exportJob);
  },

  async getExportJob(exportJobId: string): Promise<ExportJobRead> {
    const exportJob = exportsStore.find((item) => item.id === exportJobId);
    if (!exportJob) {
      throw new Error("Export job not found.");
    }
    return delay(exportJob);
  },
};
