from __future__ import annotations

from uuid import uuid4

from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import RegionType, TextRegionStatus
from app.db.base import Base, TimestampMixin


class TextRegion(Base, TimestampMixin):
    __tablename__ = "text_regions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    page_id: Mapped[str] = mapped_column(ForeignKey("pages.id"), index=True, nullable=False)
    region_index: Mapped[int] = mapped_column(Integer, nullable=False)
    region_type: Mapped[str] = mapped_column(
        String(40), default=RegionType.UNKNOWN.value, nullable=False
    )
    bounding_box: Mapped[dict] = mapped_column(JSON, nullable=False)
    polygon: Mapped[list | None] = mapped_column(JSON, nullable=True)
    detected_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    detected_language: Mapped[str | None] = mapped_column(String(16), nullable=True)
    translated_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    ocr_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    translation_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    render_style: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    editable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    status: Mapped[str] = mapped_column(
        String(40), default=TextRegionStatus.DETECTED.value, index=True, nullable=False
    )
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    page: Mapped["Page"] = relationship(back_populates="regions")


Index("uq_text_regions_page_region_index", TextRegion.page_id, TextRegion.region_index, unique=True)
Index("ix_text_regions_page_status", TextRegion.page_id, TextRegion.status)

