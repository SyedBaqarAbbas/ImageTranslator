from __future__ import annotations

from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AppError
from app.models import Page, Project
from app.services.project_service import ProjectService


class PageService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_pages(self, user_id: str, project_id: str) -> list[Page]:
        await ProjectService(self.session).get_project(user_id, project_id)
        result = await self.session.scalars(
            select(Page).where(Page.project_id == project_id).order_by(Page.page_number)
        )
        return list(result)

    async def get_page(self, user_id: str, page_id: str) -> Page:
        page = await self.session.scalar(
            select(Page)
            .options(
                selectinload(Page.original_asset),
                selectinload(Page.preview_asset),
                selectinload(Page.final_asset),
            )
            .join(Project, Project.id == Page.project_id)
            .where(Page.id == page_id, Project.user_id == user_id)
        )
        if not page:
            raise AppError("page_not_found", "Page not found.", status.HTTP_404_NOT_FOUND)
        return page

