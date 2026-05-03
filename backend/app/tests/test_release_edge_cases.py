from __future__ import annotations

import io
import zipfile
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings


def _zip_with_images(png_bytes: bytes) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("page-01.png", png_bytes)
        archive.writestr("nested/page-02.png", png_bytes)
        archive.writestr("notes.txt", b"ignored")
    return buffer.getvalue()


def test_upload_accepts_multiple_images_and_zip_archives(
    client: TestClient,
    create_project: Callable[..., str],
    png_bytes: bytes,
) -> None:
    project_id = create_project("Upload Matrix Project")

    multi_response = client.post(
        f"/api/v1/projects/{project_id}/pages/upload",
        files=[
            ("files", ("page-a.png", png_bytes, "image/png")),
            ("files", ("page-b.png", png_bytes, "image/png")),
        ],
    )
    assert multi_response.status_code == 201
    assert [page["page_number"] for page in multi_response.json()] == [1, 2]

    zip_response = client.post(
        f"/api/v1/projects/{project_id}/pages/upload",
        files={"files": ("chapter.zip", _zip_with_images(png_bytes), "application/zip")},
    )
    assert zip_response.status_code == 201
    assert [page["page_number"] for page in zip_response.json()] == [3, 4]

    pages = client.get(f"/api/v1/projects/{project_id}/pages").json()
    assert len(pages) == 4
    assert [page["page_number"] for page in pages] == [1, 2, 3, 4]


def test_upload_rejects_empty_unsupported_and_corrupt_inputs(
    client: TestClient,
    create_project: Callable[..., str],
) -> None:
    project_id = create_project("Upload Validation Project")

    empty_response = client.post(f"/api/v1/projects/{project_id}/pages/upload", files=[])
    assert empty_response.status_code == 422
    assert empty_response.json()["error"]["code"] == "validation_error"

    unsupported_response = client.post(
        f"/api/v1/projects/{project_id}/pages/upload",
        files={"files": ("notes.txt", b"not an image", "text/plain")},
    )
    assert unsupported_response.status_code == 400
    assert unsupported_response.json()["error"]["code"] == "invalid_file_type"

    corrupt_response = client.post(
        f"/api/v1/projects/{project_id}/pages/upload",
        files={"files": ("page.png", b"not a readable png", "image/png")},
    )
    assert corrupt_response.status_code == 400
    assert corrupt_response.json()["error"]["code"] == "invalid_image"


def test_auth_register_login_and_failure_contracts(client: TestClient) -> None:
    payload = {
        "email": "release-user@example.com",
        "password": "correct-horse-battery-staple",
        "display_name": "Release User",
    }

    register_response = client.post("/api/v1/auth/register", json=payload)
    assert register_response.status_code == 201
    assert register_response.json()["user"]["email"] == payload["email"]
    assert register_response.json()["access_token"]

    duplicate_response = client.post("/api/v1/auth/register", json=payload)
    assert duplicate_response.status_code == 409
    assert duplicate_response.json()["error"]["code"] == "email_taken"

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": payload["email"], "password": payload["password"]},
    )
    assert login_response.status_code == 200
    assert login_response.json()["user"]["display_name"] == "Release User"

    invalid_response = client.post(
        "/api/v1/auth/login",
        json={"email": payload["email"], "password": "wrong-password"},
    )
    assert invalid_response.status_code == 401
    assert invalid_response.json()["error"]["code"] == "invalid_credentials"


def test_asset_and_events_error_contracts(client: TestClient) -> None:
    missing_asset_response = client.get("/api/v1/assets/not-an-asset")
    assert missing_asset_response.status_code == 404
    assert missing_asset_response.json()["error"]["code"] == "asset_not_found"

    missing_events_response = client.get("/api/v1/projects/not-a-project/events")
    assert missing_events_response.status_code == 404
    assert missing_events_response.json()["error"]["code"] == "project_not_found"


def test_processing_and_export_failure_contracts(
    client: TestClient,
    create_project: Callable[..., str],
    upload_page: Callable[[str], str],
) -> None:
    project_id = create_project("Failure Contract Project")
    upload_page(project_id)

    no_matching_pages = client.post(
        f"/api/v1/projects/{project_id}/process",
        json={"force": True, "page_ids": ["not-a-real-page"]},
    )
    assert no_matching_pages.status_code == 400
    assert no_matching_pages.json()["error"]["code"] == "no_pages"

    export_response = client.post(
        f"/api/v1/projects/{project_id}/export",
        json={"format": "zip", "include_originals": False},
    )
    assert export_response.status_code == 202
    export = export_response.json()
    assert export["status"] == "failed"
    assert "No rendered pages" in export["error_message"]

    download_response = client.get(f"/api/v1/exports/{export['id']}/download")
    assert download_response.status_code == 409
    assert download_response.json()["error"]["code"] == "export_not_ready"


def test_local_asset_by_key_guards_storage_backend_and_paths(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "storage_backend", "s3")
    unavailable = client.get("/api/v1/assets/by-key/projects/example/missing.png")
    assert unavailable.status_code == 400
    assert unavailable.json()["error"]["code"] == "not_available"

    monkeypatch.setattr(settings, "storage_backend", "local")
    missing = client.get("/api/v1/assets/by-key/../outside.png")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "asset_not_found"
