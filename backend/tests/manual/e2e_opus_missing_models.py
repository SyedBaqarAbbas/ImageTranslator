from __future__ import annotations

import io
import json
import time
from pathlib import Path

import httpx
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[3]
TESTING_DIR = ROOT / "testing"
TARGET_URL = "http://127.0.0.1:8001"


def _font() -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in [
        "/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc",
        "/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc",
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    ]:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size=72)
    return ImageFont.load_default()


def _png_bytes() -> bytes:
    image = Image.new("RGB", (900, 360), "white")
    draw = ImageDraw.Draw(image)
    draw.text((120, 120), "こんにちは 世界", fill="black", font=_font())
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _json(response: httpx.Response) -> dict:
    try:
        return response.json()
    except ValueError:
        return {"raw": response.text}


def main() -> None:
    TESTING_DIR.mkdir(parents=True, exist_ok=True)
    client = httpx.Client(base_url=TARGET_URL, timeout=120)
    project = client.post(
        "/api/v1/projects",
        json={
            "name": f"E2E OPUS Missing Models {int(time.time())}",
            "source_language": "ja",
            "target_language": "en",
            "translation_tone": "natural",
            "replacement_mode": "replace",
            "reading_direction": "rtl",
        },
    )
    project.raise_for_status()
    project_id = project.json()["id"]
    pages = client.post(
        f"/api/v1/projects/{project_id}/pages/upload",
        files={"files": ("opus-missing.png", _png_bytes(), "image/png")},
    )
    pages.raise_for_status()
    page_id = pages.json()[0]["id"]

    process_response = client.post(
        f"/api/v1/projects/{project_id}/process",
        json={"force": True},
    )
    project_response = client.get(f"/api/v1/projects/{project_id}")
    page_response = client.get(f"/api/v1/pages/{page_id}")
    jobs_response = client.get(f"/api/v1/projects/{project_id}/jobs")
    result = {
        "target_url": TARGET_URL,
        "project_id": project_id,
        "page_id": page_id,
        "process_status_code": process_response.status_code,
        "process_body": _json(process_response),
        "project": _json(project_response),
        "page": _json(page_response),
        "jobs": _json(jobs_response),
    }
    (TESTING_DIR / "local-pipeline-opus-missing-result.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    error_text = json.dumps(result, ensure_ascii=False)
    if process_response.status_code < 500 and "OPUS-MT model directory not found" not in error_text:
        raise AssertionError("Missing OPUS-MT model directory was not surfaced as expected.")
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
