from __future__ import annotations

from app.core.enums import PageStatus
from app.schemas.asset import AssetRead
from app.schemas.common import Timestamped


class PageRead(Timestamped):
    id: str
    project_id: str
    page_number: int
    original_asset_id: str | None
    processed_asset_id: str | None
    cleaned_asset_id: str | None
    preview_asset_id: str | None
    final_asset_id: str | None
    width: int | None
    height: int | None
    status: PageStatus | str
    progress: int
    failure_reason: str | None


class PageDetail(PageRead):
    original_asset: AssetRead | None = None
    preview_asset: AssetRead | None = None
    final_asset: AssetRead | None = None

