from __future__ import annotations

from pydantic import BaseModel, Field

from app.core.enums import ReadingDirection, ReplacementMode
from app.schemas.common import Timestamped


class TranslationSettingsUpdate(BaseModel):
    source_language: str | None = Field(default=None, max_length=16)
    target_language: str | None = Field(default=None, max_length=16)
    translation_tone: str | None = Field(default=None, max_length=40)
    replacement_mode: ReplacementMode | None = None
    reading_direction: ReadingDirection | None = None
    preserve_sfx: bool | None = None
    bilingual: bool | None = None
    font_family: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=500)


class TranslationSettingsRead(Timestamped):
    id: str
    project_id: str
    source_language: str
    target_language: str
    translation_tone: str
    replacement_mode: str
    reading_direction: str
    preserve_sfx: bool
    bilingual: bool
    font_family: str | None
    notes: str | None

