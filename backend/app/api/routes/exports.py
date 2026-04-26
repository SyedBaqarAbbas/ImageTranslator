from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.errors import AppError
from app.db.session import get_session
from app.models import User
from app.schemas.asset import AssetDownload
from app.schemas.job import ExportJobRead, ExportRequest
from app.services.asset_service import AssetService
from app.services.export_service import ExportService

router = APIRouter(tags=["exports"])


@router.post(
    "/projects/{project_id}/export",
    response_model=ExportJobRead,
    status_code=status.HTTP_202_ACCEPTED,
)
async def export_project(
    project_id: str,
    payload: ExportRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ExportJobRead:
    return await ExportService(session).create_export_job(current_user.id, project_id, payload)


@router.get("/exports/{export_id}", response_model=ExportJobRead)
async def get_export(
    export_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ExportJobRead:
    return await ExportService(session).get_export(current_user.id, export_id)


@router.get("/exports/{export_id}/download", response_model=AssetDownload)
async def download_export(
    export_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AssetDownload:
    export = await ExportService(session).get_export(current_user.id, export_id)
    if not export.asset:
        raise AppError("export_not_ready", "Export is not ready yet.", status.HTTP_409_CONFLICT)
    url = await AssetService(session).download_url(export.asset)
    return AssetDownload(url=url, expires_in=900)

