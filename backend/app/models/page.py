from __future__ import annotations

from uuid import uuid4

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import PageStatus
from app.db.base import Base, TimestampMixin


class Page(Base, TimestampMixin):
    __tablename__ = "pages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True, nullable=False)
    page_number: Mapped[int] = mapped_column(Integer, nullable=False)
    original_asset_id: Mapped[str | None] = mapped_column(ForeignKey("file_assets.id"), nullable=True)
    processed_asset_id: Mapped[str | None] = mapped_column(
        ForeignKey("file_assets.id"), nullable=True
    )
    cleaned_asset_id: Mapped[str | None] = mapped_column(ForeignKey("file_assets.id"), nullable=True)
    preview_asset_id: Mapped[str | None] = mapped_column(ForeignKey("file_assets.id"), nullable=True)
    final_asset_id: Mapped[str | None] = mapped_column(ForeignKey("file_assets.id"), nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(
        String(40), default=PageStatus.UPLOADED.value, index=True, nullable=False
    )
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped["Project"] = relationship(back_populates="pages")
    regions: Mapped[list["TextRegion"]] = relationship(
        back_populates="page", cascade="all, delete-orphan", order_by="TextRegion.region_index"
    )
    original_asset: Mapped["FileAsset | None"] = relationship(
        foreign_keys=[original_asset_id], post_update=True
    )
    processed_asset: Mapped["FileAsset | None"] = relationship(
        foreign_keys=[processed_asset_id], post_update=True
    )
    cleaned_asset: Mapped["FileAsset | None"] = relationship(
        foreign_keys=[cleaned_asset_id], post_update=True
    )
    preview_asset: Mapped["FileAsset | None"] = relationship(
        foreign_keys=[preview_asset_id], post_update=True
    )
    final_asset: Mapped["FileAsset | None"] = relationship(
        foreign_keys=[final_asset_id], post_update=True
    )


Index("uq_pages_project_page_number", Page.project_id, Page.page_number, unique=True)
Index("ix_pages_project_status", Page.project_id, Page.status)

