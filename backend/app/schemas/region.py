from __future__ import annotations

from pydantic import BaseModel, Field

from app.core.enums import RegionType, TextRegionStatus
from app.schemas.common import Timestamped


class BoundingBox(BaseModel):
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)


class TextRegionRead(Timestamped):
    id: str
    page_id: str
    region_index: int
    region_type: RegionType | str
    bounding_box: dict
    polygon: list | None
    detected_text: str | None
    detected_language: str | None
    translated_text: str | None
    user_text: str | None
    ocr_confidence: float | None
    translation_confidence: float | None
    render_style: dict | None
    editable: bool
    status: TextRegionStatus | str
    failure_reason: str | None


class TextRegionUpdate(BaseModel):
    translated_text: str | None = Field(default=None, max_length=5000)
    user_text: str | None = Field(default=None, max_length=5000)
    region_type: RegionType | None = None
    bounding_box: BoundingBox | None = None
    render_style: dict | None = None
    editable: bool | None = None


class RetranslateRequest(BaseModel):
    source_text: str | None = Field(default=None, max_length=5000)
    target_language: str | None = Field(default=None, max_length=16)
    tone: str | None = Field(default=None, max_length=40)
