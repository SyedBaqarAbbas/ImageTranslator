from __future__ import annotations

import io
import json
from pathlib import Path

import pytest
from PIL import Image

from app.benchmarks.korean_region_detection import (
    load_local_fixtures,
    run_synthetic_benchmark,
)


def test_safe_synthetic_benchmark_improves_korean_region_detection() -> None:
    report = run_synthetic_benchmark()

    baseline = report["baseline"]
    detector = report["korean_detector"]
    assert report["fixture_source"] == "generated_safe_synthetic_pages"
    assert baseline["fixture_count"] == 4
    assert baseline["detection"]["fragmentation_errors"] == 1
    assert baseline["detection"]["merge_errors"] == 1
    assert detector["detection"] == {
        "ground_truth_regions": 6,
        "detected_regions": 6,
        "matched_regions": 6,
        "text_region_recall": 1.0,
        "false_positives": 0,
        "mean_matched_iou": 1.0,
        "fragmentation_errors": 0,
        "merge_errors": 0,
    }
    assert detector["recognition"] == {
        "correctly_ocred_detected_region_rate": 1.0,
        "automatic_cer": 0.0,
        "manual_crop_cer": 0.0,
        "manual_vs_automatic_cer_delta": 0.0,
    }
    assert detector["runtime"]["seconds"] >= 0
    assert detector["runtime"]["peak_rss_platform_units"] > 0
    assert report["improvement"]["text_region_recall_delta"] > 0
    assert report["improvement"]["false_positive_delta"] < 0
    assert report["improvement"]["fragmentation_error_delta"] < 0
    assert report["improvement"]["merge_error_delta"] < 0


def test_local_fixture_manifest_loads_private_page_annotations(tmp_path: Path) -> None:
    image = Image.new("RGB", (32, 24), "white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    (tmp_path / "page.png").write_bytes(buffer.getvalue())
    (tmp_path / "manifest.json").write_text(
        json.dumps(
            {
                "fixtures": [
                    {
                        "name": "private-page",
                        "image": "page.png",
                        "regions": [
                            {
                                "bounding_box": {
                                    "x": 4,
                                    "y": 5,
                                    "width": 12,
                                    "height": 8,
                                },
                                "text": "안녕",
                            }
                        ],
                    }
                ]
            }
        )
    )

    fixtures = load_local_fixtures(tmp_path)

    assert len(fixtures) == 1
    assert fixtures[0].name == "private-page"
    assert fixtures[0].regions[0].bounding_box == {
        "x": 4,
        "y": 5,
        "width": 12,
        "height": 8,
    }
    assert fixtures[0].regions[0].text == "안녕"


def test_local_fixture_manifest_rejects_invalid_boxes(tmp_path: Path) -> None:
    (tmp_path / "page.png").write_bytes(b"unused")
    (tmp_path / "manifest.json").write_text(
        json.dumps(
            {
                "fixtures": [
                    {
                        "name": "bad-box",
                        "image": "page.png",
                        "regions": [
                            {
                                "bounding_box": {
                                    "x": 0,
                                    "y": 0,
                                    "width": 0,
                                    "height": 8,
                                },
                                "text": "안녕",
                            }
                        ],
                    }
                ]
            }
        )
    )

    with pytest.raises(ValueError, match="Invalid benchmark region box"):
        load_local_fixtures(tmp_path)
