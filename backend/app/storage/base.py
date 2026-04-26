from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class StoredObject:
    key: str
    bucket: str | None
    storage_backend: str
    size_bytes: int
    content_type: str


class StorageBackend(Protocol):
    backend_name: str

    async def put_bytes(self, key: str, data: bytes, content_type: str) -> StoredObject:
        ...

    async def get_bytes(self, key: str, bucket: str | None = None) -> bytes:
        ...

    async def delete(self, key: str, bucket: str | None = None) -> None:
        ...

    async def exists(self, key: str, bucket: str | None = None) -> bool:
        ...

    async def presigned_url(self, key: str, bucket: str | None = None, expires_in: int = 900) -> str:
        ...

