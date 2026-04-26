from __future__ import annotations

from pydantic import BaseModel, Field

from app.core.enums import ProjectStatus, ReadingDirection, ReplacementMode
from app.schemas.common import Timestamped
from app.schemas.settings import TranslationSettingsRead


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    source_language: str = Field(default="auto", max_length=16)
    target_language: str = Field(min_length=2, max_length=16)
    translation_tone: str = Field(default="natural", max_length=40)
    replacement_mode: ReplacementMode = ReplacementMode.REPLACE
    reading_direction: ReadingDirection = ReadingDirection.RTL


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    source_language: str | None = Field(default=None, max_length=16)
    target_language: str | None = Field(default=None, max_length=16)
    translation_tone: str | None = Field(default=None, max_length=40)
    replacement_mode: ReplacementMode | None = None
    reading_direction: ReadingDirection | None = None


class ProjectRead(Timestamped):
    id: str
    user_id: str
    name: str
    description: str | None
    source_language: str
    target_language: str
    translation_tone: str
    replacement_mode: str
    reading_direction: str
    status: ProjectStatus | str
    failure_reason: str | None


class ProjectDetail(ProjectRead):
    settings: TranslationSettingsRead | None = None

