from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient


def test_project_settings_update_and_delete_release_flow(
    client: TestClient,
    create_project: Callable[..., str],
) -> None:
    project_id = create_project("Lifecycle Project")

    update_response = client.patch(
        f"/api/v1/projects/{project_id}",
        json={
            "name": "Lifecycle Project Updated",
            "description": "Ready for release.",
            "reading_direction": "ltr",
        },
    )
    assert update_response.status_code == 200
    updated_project = update_response.json()
    assert updated_project["name"] == "Lifecycle Project Updated"
    assert updated_project["reading_direction"] == "ltr"

    settings_response = client.patch(
        f"/api/v1/projects/{project_id}/settings",
        json={
            "source_language": "ja",
            "target_language": "en",
            "translation_tone": "formal",
            "replacement_mode": "overlay",
            "reading_direction": "ltr",
            "preserve_sfx": False,
            "font_family": "Komika Axis",
            "notes": "Release regression settings.",
        },
    )
    assert settings_response.status_code == 200
    settings = settings_response.json()
    assert settings["source_language"] == "ja"
    assert settings["translation_tone"] == "formal"
    assert settings["preserve_sfx"] is False

    detail = client.get(f"/api/v1/projects/{project_id}").json()
    assert detail["source_language"] == "ja"
    assert detail["settings"]["font_family"] == "Komika Axis"

    delete_response = client.delete(f"/api/v1/projects/{project_id}")
    assert delete_response.status_code == 204
    assert all(project["id"] != project_id for project in client.get("/api/v1/projects").json())

    missing_response = client.get(f"/api/v1/projects/{project_id}")
    assert missing_response.status_code == 404
    assert missing_response.json()["error"]["code"] == "project_not_found"


def test_pages_jobs_regions_and_rerender_release_flow(
    client: TestClient,
    create_project: Callable[..., str],
    upload_page: Callable[[str], str],
    process_project: Callable[[str], str],
) -> None:
    project_id = create_project("End-to-End API Project", source_language="ja")
    page_id = upload_page(project_id)
    process_job_id = process_project(project_id)

    pages_response = client.get(f"/api/v1/projects/{project_id}/pages")
    assert pages_response.status_code == 200
    pages = pages_response.json()
    assert [page["id"] for page in pages] == [page_id]
    assert pages[0]["status"] == "review_required"

    page_response = client.get(f"/api/v1/pages/{page_id}")
    assert page_response.status_code == 200
    page = page_response.json()
    assert page["original_asset"] is not None
    assert page["preview_asset"] is not None
    assert page["final_asset"] is not None

    job_response = client.get(f"/api/v1/jobs/{process_job_id}")
    assert job_response.status_code == 200
    assert job_response.json()["stage"] == "complete"

    regions_response = client.get(f"/api/v1/pages/{page_id}/regions")
    assert regions_response.status_code == 200
    region = regions_response.json()[0]
    region_id = region["id"]

    update_response = client.patch(
        f"/api/v1/regions/{region_id}",
        json={
            "user_text": "Manual translation edit",
            "bounding_box": {"x": 8, "y": 8, "width": 32, "height": 20},
            "render_style": {"fill": "#ffffff", "fillOpacity": 0.5},
            "auto_rerender": True,
        },
    )
    assert update_response.status_code == 200
    updated_region = update_response.json()
    assert updated_region["status"] == "user_edited"
    assert updated_region["user_text"] == "Manual translation edit"

    rerender_region_response = client.post(f"/api/v1/regions/{region_id}/rerender")
    assert rerender_region_response.status_code == 202
    assert rerender_region_response.json()["status"] == "succeeded"

    retranslate_response = client.post(
        f"/api/v1/regions/{region_id}/retranslate",
        json={"source_text": "もう一度", "target_language": "en", "tone": "dramatic"},
    )
    assert retranslate_response.status_code == 202
    retranslate_job = retranslate_response.json()
    assert retranslate_job["status"] == "succeeded"
    assert retranslate_job["region_id"] == region_id

    translated_region = client.get(f"/api/v1/pages/{page_id}/regions").json()[0]
    assert translated_region["translated_text"] == "[en] もう一度"
    assert translated_region["status"] in {"translated", "rendered"}

    reprocess_response = client.post(
        f"/api/v1/pages/{page_id}/reprocess",
        json={"rerun_ocr": True, "rerun_translation": True, "rerender": True},
    )
    assert reprocess_response.status_code == 202
    assert reprocess_response.json()["job_type"] == "process_page"

    rerender_page_response = client.post(f"/api/v1/pages/{page_id}/rerender")
    assert rerender_page_response.status_code == 202
    assert rerender_page_response.json()["job_type"] == "rerender_page"

    jobs = client.get(f"/api/v1/projects/{project_id}/jobs").json()
    job_types = {job["job_type"] for job in jobs}
    assert {"process_project", "process_page", "retranslate_region", "rerender_page"} <= job_types


def test_release_api_error_paths_return_contract_errors(
    client: TestClient,
    create_project: Callable[..., str],
) -> None:
    process_response = client.post(
        f"/api/v1/projects/{create_project('Empty Processing Project')}/process",
        json={"force": True},
    )
    assert process_response.status_code == 400
    assert process_response.json()["error"]["code"] == "project_has_no_pages"

    validation_response = client.post(
        "/api/v1/projects",
        json={
            "name": "",
            "source_language": "auto",
            "target_language": "en",
            "translation_tone": "natural",
            "replacement_mode": "replace",
            "reading_direction": "rtl",
        },
    )
    assert validation_response.status_code == 422
    assert validation_response.json()["error"]["code"] == "validation_error"

    assert client.get("/api/v1/pages/not-a-page").status_code == 404
    assert client.get("/api/v1/pages/not-a-page/regions").status_code == 404
    assert client.get("/api/v1/jobs/not-a-job").status_code == 404
    assert client.patch("/api/v1/regions/not-a-region", json={"user_text": "x"}).status_code == 404
