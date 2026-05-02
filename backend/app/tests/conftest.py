from __future__ import annotations

import asyncio
import io
from collections.abc import AsyncGenerator, Callable, Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.services.export_service as export_service_module
import app.services.processing_service as processing_service_module
from app.core.config import settings
from app.db.base import Base
from app.db.session import get_session
from app.main import app
from app.storage.factory import get_storage_backend


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
    monkeypatch.setattr(settings, "ocr_provider", "mock")
    monkeypatch.setattr(settings, "translation_provider", "mock")
    monkeypatch.setattr(settings, "celery_task_always_eager", True)
    monkeypatch.setattr(export_service_module, "AsyncSessionLocal", session_factory)
    monkeypatch.setattr(processing_service_module, "AsyncSessionLocal", session_factory)
    get_storage_backend.cache_clear()
    asyncio.run(init_db())

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    get_storage_backend.cache_clear()
    asyncio.run(engine.dispose())


@pytest.fixture
def png_bytes() -> bytes:
    image = Image.new("RGB", (64, 48), "white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def create_project(client: TestClient) -> Callable[..., str]:
    def _create_project(name: str = "Release Coverage Project", **overrides: object) -> str:
        payload = {
            "name": name,
            "description": "Project created by the release coverage suite.",
            "source_language": "auto",
            "target_language": "en",
            "translation_tone": "natural",
            "replacement_mode": "replace",
            "reading_direction": "rtl",
        }
        payload.update(overrides)
        response = client.post("/api/v1/projects", json=payload)
        assert response.status_code == 201
        return str(response.json()["id"])

    return _create_project


@pytest.fixture
def upload_page(client: TestClient, png_bytes: bytes) -> Callable[[str], str]:
    def _upload_page(project_id: str) -> str:
        response = client.post(
            f"/api/v1/projects/{project_id}/pages/upload",
            files={"files": ("page.png", png_bytes, "image/png")},
        )
        assert response.status_code == 201
        return str(response.json()[0]["id"])

    return _upload_page


@pytest.fixture
def process_project(client: TestClient) -> Callable[[str], str]:
    def _process_project(project_id: str) -> str:
        response = client.post(f"/api/v1/projects/{project_id}/process", json={"force": True})
        assert response.status_code == 202
        payload = response.json()
        assert payload["status"] == "succeeded"
        return str(payload["id"])

    return _process_project
