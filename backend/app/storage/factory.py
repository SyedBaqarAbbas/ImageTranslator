from __future__ import annotations

from functools import lru_cache

from app.core.config import settings
from app.storage.base import StorageBackend
from app.storage.local import LocalStorage


@lru_cache
def get_storage_backend() -> StorageBackend:
    if settings.storage_backend == "s3":
        from app.storage.s3 import S3Storage

        return S3Storage()
    return LocalStorage()
