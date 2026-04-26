from __future__ import annotations

from uuid import uuid4

from sqlalchemy import ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import AssetKind
from app.db.base import Base, TimestampMixin


class FileAsset(Base, TimestampMixin):
    __tablename__ = "file_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id"), index=True, nullable=True)
    page_id: Mapped[str | None] = mapped_column(ForeignKey("pages.id"), index=True, nullable=True)
    kind: Mapped[str] = mapped_column(String(40), default=AssetKind.ORIGINAL.value, index=True)
    storage_backend: Mapped[str] = mapped_column(String(40), default="local", nullable=False)
    bucket: Mapped[str | None] = mapped_column(String(120), nullable=True)
    key: Mapped[str] = mapped_column(String(1024), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum: Mapped[str | None] = mapped_column(String(128), nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)

    user: Mapped["User"] = relationship(back_populates="assets")
    project: Mapped["Project | None"] = relationship(back_populates="assets")


Index("ix_file_assets_project_kind", FileAsset.project_id, FileAsset.kind)
Index("ix_file_assets_key", FileAsset.key)

