from __future__ import annotations

from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import TextRegionStatus
from app.core.errors import AppError
from app.models import Page, Project, TextRegion
from app.schemas.region import TextRegionUpdate


class RegionService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_page_regions(self, user_id: str, page_id: str) -> list[TextRegion]:
        await self._assert_page_access(user_id, page_id)
        result = await self.session.scalars(
            select(TextRegion)
            .where(TextRegion.page_id == page_id)
            .order_by(TextRegion.region_index)
        )
        return list(result)

    async def update_region(
        self,
        user_id: str,
        region_id: str,
        payload: TextRegionUpdate,
    ) -> TextRegion:
        region = await self.get_region(user_id, region_id)
        data = payload.model_dump(exclude_unset=True)
        if "bounding_box" in data and data["bounding_box"] is not None:
            value = data["bounding_box"]
            data["bounding_box"] = value.model_dump() if hasattr(value, "model_dump") else value
        for key, value in data.items():
            if hasattr(value, "value"):
                value = value.value
            setattr(region, key, value)
        if payload.user_text is not None or payload.translated_text is not None:
            region.status = TextRegionStatus.USER_EDITED.value
        await self.session.commit()
        await self.session.refresh(region)
        return region

    async def get_region(self, user_id: str, region_id: str) -> TextRegion:
        region = await self.session.scalar(
            select(TextRegion)
            .join(Page, Page.id == TextRegion.page_id)
            .join(Project, Project.id == Page.project_id)
            .where(TextRegion.id == region_id, Project.user_id == user_id)
        )
        if not region:
            raise AppError("region_not_found", "Text region not found.", status.HTTP_404_NOT_FOUND)
        return region

    async def _assert_page_access(self, user_id: str, page_id: str) -> None:
        exists = await self.session.scalar(
            select(Page.id)
            .join(Project, Project.id == Page.project_id)
            .where(Page.id == page_id, Project.user_id == user_id)
        )
        if not exists:
            raise AppError("page_not_found", "Page not found.", status.HTTP_404_NOT_FOUND)
