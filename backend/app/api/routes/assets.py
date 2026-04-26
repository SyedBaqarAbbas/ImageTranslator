from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.errors import AppError
from app.db.session import get_session
from app.models import User
from app.schemas.asset import AssetDownload, AssetRead
from app.services.asset_service import AssetService
from app.storage.local import LocalStorage

router = APIRouter(prefix="/assets", tags=["assets"])


@router.get("/{asset_id}", response_model=AssetRead)
async def get_asset(
    asset_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AssetRead:
    return await AssetService(session).get_asset_for_user(asset_id, current_user.id)


@router.get("/{asset_id}/download", response_model=AssetDownload)
async def download_asset(
    asset_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AssetDownload:
    asset = await AssetService(session).get_asset_for_user(asset_id, current_user.id)
    url = await AssetService(session).download_url(asset)
    return AssetDownload(url=url, expires_in=900)


@router.get("/by-key/{key:path}", include_in_schema=False)
async def local_asset_by_key(key: str) -> FileResponse:
    if settings.storage_backend != "local":
        raise AppError("not_available", "Local file serving is only available for local storage.")
    storage = LocalStorage()
    path = storage.local_path(key)
    root = settings.local_storage_path.resolve()
    resolved = path.resolve()
    if not str(resolved).startswith(str(root)) or not resolved.exists():
        raise AppError("asset_not_found", "Asset not found.", 404)
    return FileResponse(resolved)
