from __future__ import annotations

from uuid import uuid4

from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AssetKind
from app.core.errors import AppError
from app.models import FileAsset
from app.storage.factory import get_storage_backend
from app.utils.files import safe_filename, sha256_bytes
from app.utils.images import image_dimensions


class AssetService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.storage = get_storage_backend()

    async def create_asset(
        self,
        *,
        user_id: str,
        data: bytes,
        filename: str,
        content_type: str,
        kind: AssetKind,
        project_id: str | None = None,
        page_id: str | None = None,
        key_prefix: str | None = None,
    ) -> FileAsset:
        clean_name = safe_filename(filename)
        prefix = key_prefix or f"projects/{project_id or 'unassigned'}/{kind.value}"
        key = f"{prefix.rstrip('/')}/{uuid4()}-{clean_name}"
        stored = await self.storage.put_bytes(key, data, content_type)

        width: int | None = None
        height: int | None = None
        if content_type.startswith("image/"):
            try:
                width, height = image_dimensions(data)
            except Exception:
                width = height = None

        asset = FileAsset(
            user_id=user_id,
            project_id=project_id,
            page_id=page_id,
            kind=kind.value,
            storage_backend=stored.storage_backend,
            bucket=stored.bucket,
            key=stored.key,
            filename=clean_name,
            content_type=stored.content_type,
            size_bytes=stored.size_bytes,
            checksum=sha256_bytes(data),
            width=width,
            height=height,
        )
        self.session.add(asset)
        await self.session.flush()
        return asset

    async def get_asset_for_user(self, asset_id: str, user_id: str) -> FileAsset:
        asset = await self.session.scalar(
            select(FileAsset).where(FileAsset.id == asset_id, FileAsset.user_id == user_id)
        )
        if not asset:
            raise AppError("asset_not_found", "Asset not found.", status.HTTP_404_NOT_FOUND)
        return asset

    async def download_url(self, asset: FileAsset, expires_in: int = 900) -> str:
        return await self.storage.presigned_url(asset.key, asset.bucket, expires_in)

    async def read_asset_bytes(self, asset: FileAsset) -> bytes:
        return await self.storage.get_bytes(asset.key, asset.bucket)

