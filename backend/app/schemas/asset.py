from __future__ import annotations

from pydantic import BaseModel

from app.core.enums import AssetKind
from app.schemas.common import Timestamped


class AssetRead(Timestamped):
    id: str
    user_id: str
    project_id: str | None
    page_id: str | None
    kind: AssetKind | str
    storage_backend: str
    bucket: str | None
    key: str
    filename: str
    content_type: str
    size_bytes: int
    checksum: str | None
    width: int | None
    height: int | None


class AssetDownload(BaseModel):
    url: str
    expires_in: int
