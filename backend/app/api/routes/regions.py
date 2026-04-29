from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_public_user
from app.db.session import get_session
from app.models import User
from app.schemas.job import ProcessingJobRead
from app.schemas.region import RetranslateRequest, TextRegionRead, TextRegionUpdate
from app.services.processing_service import ProcessingService
from app.services.region_service import RegionService

router = APIRouter(tags=["regions"])
PUBLIC_USER_DEP = Depends(get_public_user)
SESSION_DEP = Depends(get_session)


@router.get("/pages/{page_id}/regions", response_model=list[TextRegionRead])
async def list_page_regions(
    page_id: str,
    current_user: User = PUBLIC_USER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> list[TextRegionRead]:
    return await RegionService(session).list_page_regions(current_user.id, page_id)


@router.patch("/regions/{region_id}", response_model=TextRegionRead)
async def update_region(
    region_id: str,
    payload: TextRegionUpdate,
    current_user: User = PUBLIC_USER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> TextRegionRead:
    region = await RegionService(session).update_region(current_user.id, region_id, payload)
    if payload.auto_rerender:
        await ProcessingService(session).create_rerender_region_job(current_user.id, region.id)
        await session.refresh(region)
    return region


@router.delete(
    "/regions/{region_id}",
    response_model=ProcessingJobRead,
    status_code=status.HTTP_202_ACCEPTED,
)
async def delete_region(
    region_id: str,
    current_user: User = PUBLIC_USER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> ProcessingJobRead:
    page_id = await RegionService(session).delete_region(current_user.id, region_id)
    return await ProcessingService(session).create_rerender_page_job(current_user.id, page_id)


@router.post(
    "/regions/{region_id}/retranslate",
    response_model=ProcessingJobRead,
    status_code=status.HTTP_202_ACCEPTED,
)
async def retranslate_region(
    region_id: str,
    payload: RetranslateRequest,
    current_user: User = PUBLIC_USER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> ProcessingJobRead:
    return await ProcessingService(session).create_retranslate_region_job(
        current_user.id, region_id, payload
    )


@router.post(
    "/regions/{region_id}/rerender",
    response_model=ProcessingJobRead,
    status_code=status.HTTP_202_ACCEPTED,
)
async def rerender_region(
    region_id: str,
    current_user: User = PUBLIC_USER_DEP,
    session: AsyncSession = SESSION_DEP,
) -> ProcessingJobRead:
    return await ProcessingService(session).create_rerender_region_job(current_user.id, region_id)
