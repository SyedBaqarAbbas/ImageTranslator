from __future__ import annotations

import asyncio
from pathlib import Path

from app.core.config import settings
from app.storage.base import StoredObject


class LocalStorage:
    backend_name = "local"

    def __init__(self, root: Path | None = None) -> None:
        self.root = root or settings.local_storage_path
        self.root.mkdir(parents=True, exist_ok=True)

    def _path_for(self, key: str) -> Path:
        safe_key = key.lstrip("/").replace("..", "")
        return self.root / safe_key

    async def put_bytes(self, key: str, data: bytes, content_type: str) -> StoredObject:
        path = self._path_for(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, data)
        return StoredObject(
            key=key,
            bucket=None,
            storage_backend=self.backend_name,
            size_bytes=len(data),
            content_type=content_type,
        )

    async def get_bytes(self, key: str, bucket: str | None = None) -> bytes:
        return await asyncio.to_thread(self._path_for(key).read_bytes)

    async def delete(self, key: str, bucket: str | None = None) -> None:
        path = self._path_for(key)
        if path.exists():
            await asyncio.to_thread(path.unlink)

    async def exists(self, key: str, bucket: str | None = None) -> bool:
        return self._path_for(key).exists()

    async def presigned_url(self, key: str, bucket: str | None = None, expires_in: int = 900) -> str:
        return f"{settings.public_base_url.rstrip('/')}/api/v1/assets/by-key/{key}"

    def local_path(self, key: str) -> Path:
        return self._path_for(key)

