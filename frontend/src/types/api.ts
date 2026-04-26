export type ProjectStatus =
  | "draft"
  | "uploading"
  | "ready"
  | "processing"
  | "ocr_complete"
  | "translation_complete"
  | "review_required"
  | "completed"
  | "export_ready"
  | "failed"
  | "deleted";

export type PageStatus =
  | "uploaded"
  | "queued"
  | "preprocessing"
  | "ocr_running"
  | "ocr_complete"
  | "translating"
  | "rendering"
  | "review_required"
  | "completed"
  | "failed";

export type TextRegionStatus =
  | "detected"
  | "ocr_low_confidence"
  | "ocr_complete"
  | "translating"
  | "translated"
  | "user_edited"
  | "rendered"
  | "needs_review"
  | "failed";

export type JobStatus = "queued" | "running" | "succeeded" | "partial_success" | "failed" | "cancelled";
export type ReplacementMode = "replace" | "overlay" | "bilingual" | "side_panel" | "subtitle";
export type ReadingDirection = "ltr" | "rtl" | "ttb";
export type RegionType = "speech" | "caption" | "narration" | "sfx" | "unknown";
export type ExportFormat = "zip" | "pdf" | "images";

export interface Timestamped {
  created_at: string;
  updated_at: string;
}

export interface ProjectCreate {
  name: string;
  description?: string | null;
  source_language: string;
  target_language: string;
  translation_tone: string;
  replacement_mode: ReplacementMode;
  reading_direction: ReadingDirection;
}

export interface ProjectUpdate {
  name?: string;
  description?: string | null;
  source_language?: string;
  target_language?: string;
  translation_tone?: string;
  replacement_mode?: ReplacementMode;
  reading_direction?: ReadingDirection;
}

export interface TranslationSettingsUpdate {
  source_language?: string;
  target_language?: string;
  translation_tone?: string;
  replacement_mode?: ReplacementMode;
  reading_direction?: ReadingDirection;
  preserve_sfx?: boolean;
  bilingual?: boolean;
  font_family?: string | null;
  notes?: string | null;
}

export interface TranslationSettingsRead extends Timestamped {
  id: string;
  project_id: string;
  source_language: string;
  target_language: string;
  translation_tone: string;
  replacement_mode: ReplacementMode | string;
  reading_direction: ReadingDirection | string;
  preserve_sfx: boolean;
  bilingual: boolean;
  font_family: string | null;
  notes: string | null;
}

export interface ProjectRead extends Timestamped {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  source_language: string;
  target_language: string;
  translation_tone: string;
  replacement_mode: ReplacementMode | string;
  reading_direction: ReadingDirection | string;
  status: ProjectStatus | string;
  failure_reason: string | null;
}

export interface ProjectDetail extends ProjectRead {
  settings: TranslationSettingsRead | null;
}

export interface AssetRead extends Timestamped {
  id: string;
  user_id: string;
  project_id: string | null;
  page_id: string | null;
  kind: string;
  storage_backend: string;
  bucket: string | null;
  key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  checksum: string | null;
  width: number | null;
  height: number | null;
  url?: string;
}

export interface PageRead extends Timestamped {
  id: string;
  project_id: string;
  page_number: number;
  original_asset_id: string | null;
  processed_asset_id: string | null;
  cleaned_asset_id: string | null;
  preview_asset_id: string | null;
  final_asset_id: string | null;
  width: number | null;
  height: number | null;
  status: PageStatus | string;
  progress: number;
  failure_reason: string | null;
  original_asset?: AssetRead | null;
  preview_asset?: AssetRead | null;
  final_asset?: AssetRead | null;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextRegionRead extends Timestamped {
  id: string;
  page_id: string;
  region_index: number;
  region_type: RegionType | string;
  bounding_box: BoundingBox;
  polygon: unknown[] | null;
  detected_text: string | null;
  detected_language: string | null;
  translated_text: string | null;
  user_text: string | null;
  ocr_confidence: number | null;
  translation_confidence: number | null;
  render_style: Record<string, unknown> | null;
  editable: boolean;
  status: TextRegionStatus | string;
  failure_reason: string | null;
}

export interface TextRegionUpdate {
  translated_text?: string | null;
  user_text?: string | null;
  region_type?: RegionType;
  bounding_box?: BoundingBox;
  render_style?: Record<string, unknown> | null;
  editable?: boolean;
  auto_rerender?: boolean;
}

export interface RetranslateRequest {
  source_text?: string | null;
  target_language?: string;
  tone?: string;
}

export interface ProcessProjectRequest {
  page_ids?: string[] | null;
  force?: boolean;
}

export interface ProcessingJobRead extends Timestamped {
  id: string;
  project_id: string;
  page_id: string | null;
  region_id: string | null;
  job_type: string;
  status: JobStatus | string;
  progress: number;
  stage: string | null;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  max_attempts: number;
  celery_task_id: string | null;
  result: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface ExportRequest {
  format: ExportFormat;
  include_originals: boolean;
  page_ids?: string[] | null;
  filename?: string | null;
}

export interface ExportJobRead extends Timestamped {
  id: string;
  user_id: string;
  project_id: string;
  format: ExportFormat | string;
  status: JobStatus | string;
  progress: number;
  asset_id: string | null;
  error_message: string | null;
  settings: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  asset: AssetRead | null;
}

export interface ApiAdapter {
  listProjects(): Promise<ProjectRead[]>;
  createProject(payload: ProjectCreate): Promise<ProjectDetail>;
  updateProject(projectId: string, payload: ProjectUpdate): Promise<ProjectDetail>;
  updateSettings(projectId: string, payload: TranslationSettingsUpdate): Promise<TranslationSettingsRead>;
  uploadPages(projectId: string, files: File[]): Promise<PageRead[]>;
  getProject(projectId: string): Promise<ProjectDetail>;
  listPages(projectId: string): Promise<PageRead[]>;
  getPage(projectId: string, pageId: string): Promise<PageRead>;
  listRegions(pageId: string): Promise<TextRegionRead[]>;
  updateRegion(regionId: string, payload: TextRegionUpdate): Promise<TextRegionRead>;
  retranslateRegion(regionId: string, payload: RetranslateRequest): Promise<ProcessingJobRead>;
  processProject(projectId: string, payload: ProcessProjectRequest): Promise<ProcessingJobRead>;
  getProcessingJobs(projectId: string): Promise<ProcessingJobRead[]>;
  createExport(projectId: string, payload: ExportRequest): Promise<ExportJobRead>;
  getExportJob(exportJobId: string): Promise<ExportJobRead>;
}
