from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_session
from app.models import User
from app.schemas.common import PageParams
from app.schemas.project import ProjectCreate, ProjectDetail, ProjectRead, ProjectUpdate
from app.schemas.settings import TranslationSettingsRead, TranslationSettingsUpdate
from app.services.project_service import ProjectService

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ProjectDetail:
    return await ProjectService(session).create_project(current_user.id, payload)


@router.get("", response_model=list[ProjectRead])
async def list_projects(
    params: PageParams = Depends(),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ProjectRead]:
    return await ProjectService(session).list_projects(
        current_user.id, limit=params.limit, offset=params.offset
    )


@router.get("/{project_id}", response_model=ProjectDetail)
async def get_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ProjectDetail:
    return await ProjectService(session).get_project(current_user.id, project_id)


@router.patch("/{project_id}", response_model=ProjectDetail)
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ProjectDetail:
    return await ProjectService(session).update_project(current_user.id, project_id, payload)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await ProjectService(session).delete_project(current_user.id, project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{project_id}/settings", response_model=TranslationSettingsRead)
async def update_settings(
    project_id: str,
    payload: TranslationSettingsUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> TranslationSettingsRead:
    return await ProjectService(session).update_settings(current_user.id, project_id, payload)

