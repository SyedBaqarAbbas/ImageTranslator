from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_public_user
from app.db.session import get_session
from app.models import User
from app.schemas.job import ProcessProjectRequest, ProcessingJobRead
from app.services.processing_service import ProcessingService

router = APIRouter(tags=["processing"])


@router.post(
    "/projects/{project_id}/process",
    response_model=ProcessingJobRead,
    status_code=status.HTTP_202_ACCEPTED,
)
async def process_project(
    project_id: str,
    payload: ProcessProjectRequest,
    current_user: User = Depends(get_public_user),
    session: AsyncSession = Depends(get_session),
) -> ProcessingJobRead:
    return await ProcessingService(session).create_project_job(current_user.id, project_id, payload)


@router.get("/projects/{project_id}/jobs", response_model=list[ProcessingJobRead])
async def list_project_jobs(
    project_id: str,
    current_user: User = Depends(get_public_user),
    session: AsyncSession = Depends(get_session),
) -> list[ProcessingJobRead]:
    return await ProcessingService(session).list_jobs(current_user.id, project_id)


@router.get("/jobs/{job_id}", response_model=ProcessingJobRead)
async def get_job(
    job_id: str,
    current_user: User = Depends(get_public_user),
    session: AsyncSession = Depends(get_session),
) -> ProcessingJobRead:
    return await ProcessingService(session).get_job(current_user.id, job_id)
