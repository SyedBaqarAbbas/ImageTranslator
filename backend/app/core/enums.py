from __future__ import annotations

from enum import StrEnum


class ProjectStatus(StrEnum):
    DRAFT = "draft"
    UPLOADING = "uploading"
    READY = "ready"
    PROCESSING = "processing"
    OCR_COMPLETE = "ocr_complete"
    TRANSLATION_COMPLETE = "translation_complete"
    REVIEW_REQUIRED = "review_required"
    COMPLETED = "completed"
    EXPORT_READY = "export_ready"
    FAILED = "failed"
    DELETED = "deleted"


class PageStatus(StrEnum):
    UPLOADED = "uploaded"
    QUEUED = "queued"
    PREPROCESSING = "preprocessing"
    OCR_RUNNING = "ocr_running"
    OCR_COMPLETE = "ocr_complete"
    TRANSLATING = "translating"
    RENDERING = "rendering"
    REVIEW_REQUIRED = "review_required"
    COMPLETED = "completed"
    FAILED = "failed"


class TextRegionStatus(StrEnum):
    DETECTED = "detected"
    OCR_LOW_CONFIDENCE = "ocr_low_confidence"
    OCR_COMPLETE = "ocr_complete"
    TRANSLATING = "translating"
    TRANSLATED = "translated"
    USER_EDITED = "user_edited"
    RENDERED = "rendered"
    NEEDS_REVIEW = "needs_review"
    FAILED = "failed"


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    PARTIAL_SUCCESS = "partial_success"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobType(StrEnum):
    PROCESS_PROJECT = "process_project"
    PROCESS_PAGE = "process_page"
    RETRANSLATE_REGION = "retranslate_region"
    RERENDER_PAGE = "rerender_page"
    EXPORT_PROJECT = "export_project"


class AssetKind(StrEnum):
    ORIGINAL = "original"
    PROCESSED = "processed"
    CLEANED = "cleaned"
    PREVIEW = "preview"
    FINAL = "final"
    EXPORT = "export"
    ARCHIVE = "archive"


class ReplacementMode(StrEnum):
    REPLACE = "replace"
    OVERLAY = "overlay"
    BILINGUAL = "bilingual"
    SIDE_PANEL = "side_panel"
    SUBTITLE = "subtitle"


class ReadingDirection(StrEnum):
    LTR = "ltr"
    RTL = "rtl"
    TTB = "ttb"


class RegionType(StrEnum):
    SPEECH = "speech"
    CAPTION = "caption"
    NARRATION = "narration"
    SFX = "sfx"
    UNKNOWN = "unknown"


class ExportFormat(StrEnum):
    ZIP = "zip"
    PDF = "pdf"
    IMAGES = "images"

