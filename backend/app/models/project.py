from __future__ import annotations

from uuid import uuid4

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ProjectStatus, ReadingDirection, ReplacementMode
from app.db.base import Base, TimestampMixin


class Project(Base, TimestampMixin):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_language: Mapped[str] = mapped_column(String(16), default="auto", nullable=False)
    target_language: Mapped[str] = mapped_column(String(16), nullable=False)
    translation_tone: Mapped[str] = mapped_column(String(40), default="natural", nullable=False)
    replacement_mode: Mapped[str] = mapped_column(
        String(40), default=ReplacementMode.REPLACE.value, nullable=False
    )
    reading_direction: Mapped[str] = mapped_column(
        String(16), default=ReadingDirection.RTL.value, nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(40), default=ProjectStatus.DRAFT.value, index=True, nullable=False
    )
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped["User"] = relationship(back_populates="projects")
    pages: Mapped[list["Page"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="Page.page_number"
    )
    settings: Mapped["TranslationSettings | None"] = relationship(
        back_populates="project", cascade="all, delete-orphan", uselist=False
    )
    jobs: Mapped[list["ProcessingJob"]] = relationship(back_populates="project")
    export_jobs: Mapped[list["ExportJob"]] = relationship(back_populates="project")
    assets: Mapped[list["FileAsset"]] = relationship(back_populates="project")


Index("ix_projects_user_status_updated", Project.user_id, Project.status, Project.updated_at)

