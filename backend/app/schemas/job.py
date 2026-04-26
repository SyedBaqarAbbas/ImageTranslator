from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.core.enums import ExportFormat, JobStatus, JobType
from app.schemas.asset import AssetRead
from app.schemas.common import Timestamped


class ProcessProjectRequest(BaseModel):
    page_ids: list[str] | None = None
    force: bool = False


class ReprocessPageRequest(BaseModel):
    rerun_ocr: bool = True
    rerun_translation: bool = True
    rerender: bool = True


class ProcessingJobRead(Timestamped):
    id: str
    project_id: str
    page_id: str | None
    region_id: str | None
    job_type: JobType | str
    status: JobStatus | str
    progress: int
    stage: str | None
    error_code: str | None
    error_message: str | None
    attempts: int
    max_attempts: int
    celery_task_id: str | None
    result: dict | None
    started_at: datetime | None
    completed_at: datetime | None


class ExportRequest(BaseModel):
    format: ExportFormat = ExportFormat.ZIP
    include_originals: bool = False
    page_ids: list[str] | None = None
    filename: str | None = Field(default=None, max_length=160)


class ExportJobRead(Timestamped):
    id: str
    user_id: str
    project_id: str
    format: ExportFormat | str
    status: JobStatus | str
    progress: int
    asset_id: str | None
    error_message: str | None
    settings: dict | None
    started_at: datetime | None
    completed_at: datetime | None
    asset: AssetRead | None = None
