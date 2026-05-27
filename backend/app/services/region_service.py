from __future__ import annotations

from fastapi import status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import TextRegionStatus
from app.core.errors import AppError
from app.models import Page, Project, TextRegion
from app.schemas.region import TextRegionCreate, TextRegionUpdate


class RegionService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_page_regions(self, user_id: str, page_id: str) -> list[TextRegion]:
        await self._assert_page_access(user_id, page_id)
        result = await self.session.scalars(
            select(TextRegion)
            .where(
                TextRegion.page_id == page_id,
                TextRegion.status != TextRegionStatus.REJECTED.value,
            )
            .order_by(TextRegion.region_index)
        )
        return list(result)

    async def create_region(
        self,
        user_id: str,
        page_id: str,
        payload: TextRegionCreate,
    ) -> TextRegion:
        await self._assert_page_access(user_id, page_id)
        next_region_index = (
            await self.session.scalar(
                select(func.coalesce(func.max(TextRegion.region_index), 0) + 1).where(
                    TextRegion.page_id == page_id
                )
            )
        ) or 1
        detected_text = payload.detected_text
        user_text = payload.user_text
        status_value = (
            TextRegionStatus.USER_EDITED.value
            if user_text and user_text.strip()
            else TextRegionStatus.DETECTED.value
            if detected_text and detected_text.strip()
            else TextRegionStatus.NEEDS_REVIEW.value
        )
        region = TextRegion(
            page_id=page_id,
            region_index=next_region_index,
            region_type=payload.region_type.value,
            bounding_box=payload.bounding_box.model_dump(),
            detected_text=detected_text,
            translated_text=payload.translated_text,
            user_text=user_text,
            render_style=payload.render_style or {"align": "center", "padding": 6},
            editable=payload.editable,
            status=status_value,
        )
        self.session.add(region)
        await self.session.commit()
        await self.session.refresh(region)
        return region

    async def update_region(
        self,
        user_id: str,
        region_id: str,
        payload: TextRegionUpdate,
    ) -> TextRegion:
        region = await self.get_region(user_id, region_id)
        data = payload.model_dump(exclude={"auto_rerender"}, exclude_unset=True)
        detected_text_was_set = "detected_text" in data
        user_text_was_set = "user_text" in data
        translated_text_was_set = "translated_text" in data
        bounding_box_was_set = "bounding_box" in data
        render_style_was_set = "render_style" in data
        if "bounding_box" in data and data["bounding_box"] is not None:
            value = data["bounding_box"]
            data["bounding_box"] = value.model_dump() if hasattr(value, "model_dump") else value
        for key, value in data.items():
            if hasattr(value, "value"):
                value = value.value
            setattr(region, key, value)
        if detected_text_was_set:
            detected_text = region.detected_text or ""
            region.ocr_confidence = None
            region.failure_reason = None
            region.status = (
                TextRegionStatus.DETECTED.value
                if detected_text.strip()
                else TextRegionStatus.NEEDS_REVIEW.value
            )
        if user_text_was_set or translated_text_was_set:
            region.status = TextRegionStatus.USER_EDITED.value
        elif bounding_box_was_set or render_style_was_set:
            region.status = TextRegionStatus.USER_EDITED.value
        await self.session.commit()
        await self.session.refresh(region)
        return region

    async def delete_region(self, user_id: str, region_id: str) -> str:
        region = await self.get_region(user_id, region_id)
        page_id = region.page_id
        await self.session.delete(region)
        await self.session.commit()
        return page_id

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
