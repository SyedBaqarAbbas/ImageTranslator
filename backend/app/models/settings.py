from __future__ import annotations

from uuid import uuid4

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ReadingDirection, ReplacementMode
from app.db.base import Base, TimestampMixin


class TranslationSettings(Base, TimestampMixin):
    __tablename__ = "translation_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"), unique=True, index=True, nullable=False
    )
    source_language: Mapped[str] = mapped_column(String(16), default="auto", nullable=False)
    target_language: Mapped[str] = mapped_column(String(16), nullable=False)
    translation_tone: Mapped[str] = mapped_column(String(40), default="natural", nullable=False)
    replacement_mode: Mapped[str] = mapped_column(
        String(40), default=ReplacementMode.REPLACE.value, nullable=False
    )
    reading_direction: Mapped[str] = mapped_column(
        String(16), default=ReadingDirection.RTL.value, nullable=False
    )
    preserve_sfx: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    bilingual: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    font_family: Mapped[str | None] = mapped_column(String(120), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    project: Mapped["Project"] = relationship(back_populates="settings")

