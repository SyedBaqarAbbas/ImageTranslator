from __future__ import annotations

import asyncio
import io
from collections.abc import AsyncGenerator, Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.services.processing_service as processing_service_module
from app.core.config import settings
from app.core.enums import PageStatus, ProjectStatus, RegionType
from app.db.base import Base
from app.db.session import get_session
from app.main import app
from app.providers.ocr import OCRRegion
from app.storage.factory import get_storage_backend


def _png_bytes() -> bytes:
    image = Image.new("RGB", (240, 160), "white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class FakeOCRProvider:
    async def detect_and_read(
        self,
        image_bytes: bytes,
        source_language: str = "auto",
    ) -> list[OCRRegion]:
        return [
            OCRRegion(
                region_index=0,
                bounding_box={"x": 20, "y": 20, "width": 120, "height": 40},
                polygon=None,
                text="こんにちは",
                language="ja",
                confidence=0.95,
                region_type=RegionType.UNKNOWN.value,
            )
        ]


class FailingTranslationProvider:
    async def translate_many(
        self,
        texts: list[str],
        source_language: str,
        target_language: str,
        tone: str = "natural",
        context: dict | None = None,
    ) -> list:
        raise FileNotFoundError("OPUS-MT model directory not found: /tmp/opus-mt/ja-en")


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
    monkeypatch.setattr(processing_service_module, "AsyncSessionLocal", session_factory)
    monkeypatch.setattr(processing_service_module, "get_ocr_provider", lambda: FakeOCRProvider())
    monkeypatch.setattr(
        processing_service_module,
        "get_translation_provider",
        lambda: FailingTranslationProvider(),
    )
    get_storage_backend.cache_clear()
    asyncio.run(init_db())

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    get_storage_backend.cache_clear()
    asyncio.run(engine.dispose())


def test_project_processing_failure_marks_current_page_failed(client: TestClient) -> None:
    project_response = client.post(
        "/api/v1/projects",
        json={
            "name": "Failing OPUS Project",
            "source_language": "ja",
            "target_language": "en",
            "translation_tone": "natural",
            "replacement_mode": "replace",
            "reading_direction": "rtl",
        },
    )
    assert project_response.status_code == 201
    project_id = project_response.json()["id"]

    upload_response = client.post(
        f"/api/v1/projects/{project_id}/pages/upload",
        files={"files": ("page.png", _png_bytes(), "image/png")},
    )
    assert upload_response.status_code == 201
    page_id = upload_response.json()[0]["id"]

    process_response = client.post(
        f"/api/v1/projects/{project_id}/process",
        json={"force": True},
    )
    assert process_response.status_code == 500

    project = client.get(f"/api/v1/projects/{project_id}").json()
    page = client.get(f"/api/v1/pages/{page_id}").json()
    jobs = client.get(f"/api/v1/projects/{project_id}/jobs").json()

    assert project["status"] == ProjectStatus.FAILED.value
    assert "OPUS-MT model directory not found" in project["failure_reason"]
    assert page["status"] == PageStatus.FAILED.value
    assert "OPUS-MT model directory not found" in page["failure_reason"]
    assert jobs[0]["status"] == "failed"
    assert jobs[0]["error_code"] == "FileNotFoundError"
