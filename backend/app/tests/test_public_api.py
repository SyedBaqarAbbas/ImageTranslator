from __future__ import annotations

import asyncio
import io
import zipfile
from collections.abc import AsyncGenerator, Generator
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


def _create_project(client: TestClient, name: str = "Export Project") -> str:
    response = client.post(
        "/api/v1/projects",
        json={
            "name": name,
            "source_language": "auto",
            "target_language": "en",
            "translation_tone": "natural",
            "replacement_mode": "replace",
            "reading_direction": "rtl",
        },
    )
    assert response.status_code == 201
    return str(response.json()["id"])


def _upload_page(client: TestClient, project_id: str) -> str:
    response = client.post(
        f"/api/v1/projects/{project_id}/pages/upload",
        files={"files": ("page.png", _png_bytes(), "image/png")},
    )
    assert response.status_code == 201
    return str(response.json()[0]["id"])


def _process_project(client: TestClient, project_id: str) -> None:
    response = client.post(
        f"/api/v1/projects/{project_id}/process",
        json={"force": True},
    )
    assert response.status_code == 202
    assert response.json()["status"] == "succeeded"


def _download_asset_bytes(client: TestClient, asset_id: str) -> bytes:
    download_response = client.get(f"/api/v1/assets/{asset_id}/download")
    assert download_response.status_code == 200
    url = download_response.json()["url"]
    assert url.startswith("http://testserver/api/v1/assets/by-key/")
    file_response = client.get(url.removeprefix("http://testserver"))
    assert file_response.status_code == 200
    return file_response.content


def test_runtime_language_reports_configured_locked_language(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "translation_provider", "opus_mt")
    monkeypatch.setattr(settings, "opus_mt_default_source_language", "kor")

    response = client.get("/api/v1/runtime/language")

    assert response.status_code == 200
    assert response.json() == {
        "source_language": "ko",
        "target_language": "en",
        "provider": "opus_mt",
        "locked": True,
        "lock_message": "Ask a system administrator to change the language.",
    }


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


def test_export_returns_loaded_asset_without_authorization(client: TestClient) -> None:
    project_id = _create_project(client)
    _upload_page(client, project_id)
    _process_project(client, project_id)

    export_response = client.post(
        f"/api/v1/projects/{project_id}/export",
        json={"format": "zip", "include_originals": True, "filename": "export-project"},
    )

    assert export_response.status_code == 202
    export = export_response.json()
    assert export["status"] == "succeeded"
    assert export["asset_id"]
    assert export["asset"]["id"] == export["asset_id"]
    assert export["asset"]["content_type"] == "application/zip"
    archive = zipfile.ZipFile(io.BytesIO(_download_asset_bytes(client, export["asset_id"])))
    assert "translated/page-0001.png" in archive.namelist()
    assert "originals/page-0001-page.png" in archive.namelist()


def test_export_pdf_returns_loaded_asset_without_authorization(client: TestClient) -> None:
    project_id = _create_project(client, "PDF Export Project")
    _upload_page(client, project_id)
    _process_project(client, project_id)

    export_response = client.post(
        f"/api/v1/projects/{project_id}/export",
        json={"format": "pdf", "include_originals": True, "filename": "export-project"},
    )

    assert export_response.status_code == 202
    export = export_response.json()
    assert export["status"] == "succeeded"
    assert export["asset"]["content_type"] == "application/pdf"
    assert _download_asset_bytes(client, export["asset_id"]).startswith(b"%PDF")


def test_export_images_format_returns_image_zip(client: TestClient) -> None:
    project_id = _create_project(client, "Image ZIP Export Project")
    _upload_page(client, project_id)
    _process_project(client, project_id)

    export_response = client.post(
        f"/api/v1/projects/{project_id}/export",
        json={"format": "images", "include_originals": False, "filename": "page-images"},
    )

    assert export_response.status_code == 202
    export = export_response.json()
    assert export["status"] == "succeeded"
    assert export["format"] == "images"
    assert export["asset"]["filename"] == "page-images.zip"
    assert export["asset"]["content_type"] == "application/zip"
    archive = zipfile.ZipFile(io.BytesIO(_download_asset_bytes(client, export["asset_id"])))
    assert archive.namelist() == ["page-0001.png"]


def test_export_without_rendered_pages_returns_failed_job(client: TestClient) -> None:
    project_id = _create_project(client, "Original Only Project")
    _upload_page(client, project_id)

    export_response = client.post(
        f"/api/v1/projects/{project_id}/export",
        json={"format": "zip", "include_originals": False, "filename": "export-project"},
    )

    assert export_response.status_code == 202
    export = export_response.json()
    assert export["status"] == "failed"
    assert "Process the project first" in export["error_message"]


def test_export_without_pages_returns_failed_job(client: TestClient) -> None:
    project_id = _create_project(client, "Empty Export Project")

    export_response = client.post(
        f"/api/v1/projects/{project_id}/export",
        json={"format": "zip", "include_originals": False, "filename": "export-project"},
    )

    assert export_response.status_code == 202
    export = export_response.json()
    assert export["status"] == "failed"
    assert "Upload at least one page" in export["error_message"]


def test_delete_region_removes_region_and_rerenders_page(client: TestClient) -> None:
    project_response = client.post(
        "/api/v1/projects",
        json={
            "name": "Delete Region Project",
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
    page_id = upload_response.json()[0]["id"]

    process_response = client.post(
        f"/api/v1/projects/{project_id}/process",
        json={"force": True},
    )
    assert process_response.status_code == 202

    regions_response = client.get(f"/api/v1/pages/{page_id}/regions")
    assert regions_response.status_code == 200
    regions = regions_response.json()
    assert len(regions) == 1

    delete_response = client.delete(f"/api/v1/regions/{regions[0]['id']}")
    assert delete_response.status_code == 202
    assert delete_response.json()["status"] == "succeeded"

    assert client.get(f"/api/v1/pages/{page_id}/regions").json() == []
    page = client.get(f"/api/v1/pages/{page_id}").json()
    assert page["preview_asset_id"]
