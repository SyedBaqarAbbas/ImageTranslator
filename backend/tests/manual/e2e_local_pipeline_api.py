from __future__ import annotations

import io
import json
import sys
import time
from pathlib import Path
from typing import Any

import httpx
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
TESTING_DIR = ROOT / "testing"
ARTIFACT_DIR = TESTING_DIR / "artifacts"
TARGET_URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
SOURCE_LANGUAGE = sys.argv[2] if len(sys.argv) > 2 else "ja"
EXPECTED_TRANSLATION_PREFIX = sys.argv[3] if len(sys.argv) > 3 else "[en]"


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    korean = SOURCE_LANGUAGE.lower() in {"ko", "kr", "kor", "korean"}
    candidates = [
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc",
        "/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
    ]
    if not korean:
        candidates = [candidates[1], candidates[2], candidates[0], candidates[3]]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def _make_test_image() -> bytes:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", (900, 520), "white")
    draw = ImageDraw.Draw(image)
    draw.rectangle((80, 90, 820, 260), outline="black", width=4)
    korean = SOURCE_LANGUAGE.lower() in {"ko", "kr", "kor", "korean"}
    first_line = "안녕하세요 세계" if korean else "こんにちは 世界"
    second_line = "테스트 123" if korean else "テスト 123"
    draw.text((130, 130), first_line, fill="black", font=_font(72))
    draw.text((130, 315), second_line, fill="black", font=_font(64))
    output = io.BytesIO()
    image.save(output, format="PNG")
    payload = output.getvalue()
    (ARTIFACT_DIR / f"local-pipeline-{SOURCE_LANGUAGE}.png").write_bytes(payload)
    return payload


def _assert_status(response: httpx.Response, expected: int) -> dict[str, Any]:
    if response.status_code != expected:
        raise AssertionError(
            f"{response.request.method} {response.request.url} returned "
            f"{response.status_code}, expected {expected}: {response.text}"
        )
    if response.content:
        return response.json()
    return {}


def main() -> None:
    client = httpx.Client(base_url=TARGET_URL, timeout=120)
    image_bytes = _make_test_image()

    health = _assert_status(client.get("/api/v1/health"), 200)
    project = _assert_status(
        client.post(
            "/api/v1/projects",
            json={
                "name": f"E2E Local Pipeline {int(time.time())}",
                "source_language": SOURCE_LANGUAGE,
                "target_language": "en",
                "translation_tone": "natural",
                "replacement_mode": "replace",
                "reading_direction": "rtl",
            },
        ),
        201,
    )
    project_id = project["id"]

    uploaded_pages = _assert_status(
        client.post(
            f"/api/v1/projects/{project_id}/pages/upload",
            files={"files": ("local-pipeline-japanese.png", image_bytes, "image/png")},
        ),
        201,
    )
    page = uploaded_pages[0]
    page_id = page["id"]

    job = _assert_status(
        client.post(
            f"/api/v1/projects/{project_id}/process",
            json={"force": True},
        ),
        202,
    )
    refreshed_project = _assert_status(client.get(f"/api/v1/projects/{project_id}"), 200)
    refreshed_page = _assert_status(client.get(f"/api/v1/pages/{page_id}"), 200)
    regions = _assert_status(client.get(f"/api/v1/pages/{page_id}/regions"), 200)

    final_asset_id = refreshed_page.get("final_asset_id")
    final_asset_check: dict[str, Any] = {"asset_id": final_asset_id, "download_ok": False}
    if final_asset_id:
        download = _assert_status(client.get(f"/api/v1/assets/{final_asset_id}/download"), 200)
        final_response = httpx.get(download["url"], timeout=60)
        final_asset_check = {
            "asset_id": final_asset_id,
            "download_url": download["url"],
            "download_ok": final_response.status_code == 200
            and final_response.headers.get("content-type") == "image/png",
            "content_type": final_response.headers.get("content-type"),
            "byte_count": len(final_response.content),
        }
        if final_asset_check["download_ok"]:
            (ARTIFACT_DIR / f"local-pipeline-final-{SOURCE_LANGUAGE}.png").write_bytes(
                final_response.content
            )

    assertions = {
        "health_ok": health["status"] == "ok",
        "job_succeeded": job["status"] == "succeeded",
        "project_review_required": refreshed_project["status"] == "review_required",
        "page_review_required": refreshed_page["status"] == "review_required",
        "regions_detected": len(regions) > 0,
        "any_detected_text": any(region.get("detected_text") for region in regions),
        "mock_translation_prefix": all(
            (region.get("translated_text") or "").startswith(EXPECTED_TRANSLATION_PREFIX)
            for region in regions
        ),
        "final_asset_download_ok": final_asset_check["download_ok"],
    }

    result = {
        "target_url": TARGET_URL,
        "source_language": SOURCE_LANGUAGE,
        "project_id": project_id,
        "page_id": page_id,
        "job": job,
        "project_status": refreshed_project["status"],
        "page_status": refreshed_page["status"],
        "regions": regions,
        "final_asset": final_asset_check,
        "assertions": assertions,
    }
    (TESTING_DIR / f"local-pipeline-api-result-{SOURCE_LANGUAGE}.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    failed = [name for name, passed in assertions.items() if not passed]
    if failed:
        raise AssertionError(f"API E2E assertions failed: {failed}")
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
