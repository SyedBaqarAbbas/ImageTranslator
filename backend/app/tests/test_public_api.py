from __future__ import annotations

import asyncio
import io
from collections.abc import AsyncGenerator, Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.db.base import Base
from app.db.session import get_session
from app.main import app
from app.storage.factory import get_storage_backend


def _png_bytes() -> bytes:
    image = Image.new("RGB", (16, 16), "white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'test.db'}")
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async def override_get_session() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            yield session

    async def init_db() -> None:
        import app.models  # noqa: F401

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    monkeypatch.setattr(settings, "local_storage_path", tmp_path / "storage")
    monkeypatch.setattr(settings, "public_base_url", "http://testserver")
    get_storage_backend.cache_clear()
    asyncio.run(init_db())

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    get_storage_backend.cache_clear()
    asyncio.run(engine.dispose())


def test_project_routes_use_public_user_without_authorization(client: TestClient) -> None:
    response = client.post(
        "/api/v1/projects",
        json={
            "name": "Public Project",
            "source_language": "auto",
            "target_language": "en",
            "translation_tone": "natural",
            "replacement_mode": "replace",
            "reading_direction": "rtl",
        },
    )

    assert response.status_code == 201
    project = response.json()
    assert project["name"] == "Public Project"
    assert project["user_id"]

    list_response = client.get("/api/v1/projects")
    assert list_response.status_code == 200
    assert [item["id"] for item in list_response.json()] == [project["id"]]

    me_response = client.get("/api/v1/me")
    assert me_response.status_code == 200
    assert me_response.json()["email"] == settings.public_user_email


def test_upload_and_asset_download_work_without_authorization(client: TestClient) -> None:
    project_response = client.post(
        "/api/v1/projects",
        json={
            "name": "Upload Project",
            "source_language": "auto",
            "target_language": "en",
            "translation_tone": "natural",
            "replacement_mode": "replace",
            "reading_direction": "rtl",
        },
    )
    project_id = project_response.json()["id"]

    upload_response = client.post(
        f"/api/v1/projects/{project_id}/pages/upload",
        files={"files": ("page.png", _png_bytes(), "image/png")},
    )

    assert upload_response.status_code == 201
    page = upload_response.json()[0]
    assert page["original_asset_id"]

    asset_response = client.get(f"/api/v1/assets/{page['original_asset_id']}/download")
    assert asset_response.status_code == 200
    assert asset_response.json()["url"].startswith("http://testserver/api/v1/assets/by-key/")
