from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_session
from app.models import User
from app.schemas.job import ProcessingJobRead, ReprocessPageRequest
from app.schemas.page import PageDetail, PageRead
from app.services.page_service import PageService
from app.services.processing_service import ProcessingService
from app.services.project_service import ProjectService
from app.services.upload_service import UploadService

router = APIRouter(tags=["pages"])


@router.post(
    "/projects/{project_id}/pages/upload",
    response_model=list[PageRead],
    status_code=status.HTTP_201_CREATED,
)
async def upload_pages(
    project_id: str,
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[PageRead]:
    project = await ProjectService(session).get_project(current_user.id, project_id)
    return await UploadService(session).upload_pages(current_user.id, project, files)


@router.get("/projects/{project_id}/pages", response_model=list[PageRead])
async def list_pages(
    project_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[PageRead]:
    return await PageService(session).list_pages(current_user.id, project_id)


@router.get("/pages/{page_id}", response_model=PageDetail)
async def get_page(
    page_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PageDetail:
    return await PageService(session).get_page(current_user.id, page_id)


@router.post("/pages/{page_id}/reprocess", response_model=ProcessingJobRead, status_code=status.HTTP_202_ACCEPTED)
async def reprocess_page(
    page_id: str,
    payload: ReprocessPageRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ProcessingJobRead:
    return await ProcessingService(session).create_page_job(current_user.id, page_id, payload)


@router.post("/pages/{page_id}/rerender", response_model=ProcessingJobRead, status_code=status.HTTP_202_ACCEPTED)
async def rerender_page(
    page_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ProcessingJobRead:
    return await ProcessingService(session).create_rerender_page_job(current_user.id, page_id)

