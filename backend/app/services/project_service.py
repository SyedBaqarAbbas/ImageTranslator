from __future__ import annotations

from fastapi import status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import ProjectStatus
from app.core.errors import AppError
from app.models import Page, Project, TranslationSettings
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.schemas.settings import TranslationSettingsUpdate


class ProjectService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_project(self, user_id: str, payload: ProjectCreate) -> Project:
        project = Project(
            user_id=user_id,
            name=payload.name,
            description=payload.description,
            source_language=payload.source_language,
            target_language=payload.target_language,
            translation_tone=payload.translation_tone,
            replacement_mode=payload.replacement_mode.value,
            reading_direction=payload.reading_direction.value,
            status=ProjectStatus.DRAFT.value,
        )
        self.session.add(project)
        await self.session.flush()
        self.session.add(
            TranslationSettings(
                project_id=project.id,
                source_language=project.source_language,
                target_language=project.target_language,
                translation_tone=project.translation_tone,
                replacement_mode=project.replacement_mode,
                reading_direction=project.reading_direction,
            )
        )
        await self.session.commit()
        return await self.get_project(user_id, project.id)

    async def list_projects(self, user_id: str, limit: int = 50, offset: int = 0) -> list[Project]:
        result = await self.session.scalars(
            select(Project)
            .where(Project.user_id == user_id, Project.status != ProjectStatus.DELETED.value)
            .order_by(Project.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result)

    async def get_project(self, user_id: str, project_id: str) -> Project:
        project = await self.session.scalar(
            select(Project)
            .options(selectinload(Project.settings))
            .where(
                Project.id == project_id,
                Project.user_id == user_id,
                Project.status != ProjectStatus.DELETED.value,
            )
        )
        if not project:
            raise AppError("project_not_found", "Project not found.", status.HTTP_404_NOT_FOUND)
        return project

    async def update_project(self, user_id: str, project_id: str, payload: ProjectUpdate) -> Project:
        project = await self.get_project(user_id, project_id)
        data = payload.model_dump(exclude_unset=True)
        for key, value in data.items():
            if hasattr(value, "value"):
                value = value.value
            setattr(project, key, value)
        await self.session.commit()
        return await self.get_project(user_id, project_id)

    async def delete_project(self, user_id: str, project_id: str) -> None:
        project = await self.get_project(user_id, project_id)
        project.status = ProjectStatus.DELETED.value
        await self.session.commit()

    async def update_settings(
        self,
        user_id: str,
        project_id: str,
        payload: TranslationSettingsUpdate,
    ) -> TranslationSettings:
        project = await self.get_project(user_id, project_id)
        if project.settings is None:
            project.settings = TranslationSettings(
                project_id=project.id,
                source_language=project.source_language,
                target_language=project.target_language,
                translation_tone=project.translation_tone,
                replacement_mode=project.replacement_mode,
                reading_direction=project.reading_direction,
            )

        data = payload.model_dump(exclude_unset=True)
        for key, value in data.items():
            if hasattr(value, "value"):
                value = value.value
            setattr(project.settings, key, value)
            if key in {
                "source_language",
                "target_language",
                "translation_tone",
                "replacement_mode",
                "reading_direction",
            }:
                setattr(project, key, value)
        await self.session.commit()
        await self.session.refresh(project.settings)
        return project.settings

    async def page_count(self, project_id: str) -> int:
        count = await self.session.scalar(select(func.count(Page.id)).where(Page.project_id == project_id))
        return int(count or 0)

