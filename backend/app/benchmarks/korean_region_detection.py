from __future__ import annotations

import io
import json
import resource
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw

from app.core.config import settings
from app.providers.ocr import (
    TesseractOCRProvider,
    _crop_image_bytes,
    _detect_korean_text_blocks,
)

Box = dict[str, int]


@dataclass(frozen=True)
class BenchmarkRegion:
    bounding_box: Box
    text: str


@dataclass(frozen=True)
class BenchmarkFixture:
    name: str
    image_bytes: bytes
    regions: list[BenchmarkRegion]
    baseline_predictions: list[BenchmarkRegion]


def run_synthetic_benchmark() -> dict[str, Any]:
    fixtures = _synthetic_fixtures()
    manual_predictions = {
        fixture.name: list(fixture.regions)
        for fixture in fixtures
    }

    baseline_started = time.perf_counter()
    baseline_predictions = {
        fixture.name: list(fixture.baseline_predictions)
        for fixture in fixtures
    }
    baseline_elapsed = time.perf_counter() - baseline_started

    detector_started = time.perf_counter()
    detector_predictions = {
        fixture.name: _oracle_text_predictions(
            _detect_korean_text_blocks(fixture.image_bytes),
            fixture.regions,
        )
        for fixture in fixtures
    }
    detector_elapsed = time.perf_counter() - detector_started

    baseline = evaluate_predictions(
        fixtures,
        baseline_predictions,
        manual_predictions,
        elapsed_seconds=baseline_elapsed,
    )
    korean_detector = evaluate_predictions(
        fixtures,
        detector_predictions,
        manual_predictions,
        elapsed_seconds=detector_elapsed,
    )
    return {
        "fixture_source": "generated_safe_synthetic_pages",
        "recognition_evidence": (
            "Synthetic clean-crop oracle. Run with --fixture-dir for actual Tesseract OCR evidence."
        ),
        "baseline": baseline,
        "korean_detector": korean_detector,
        "improvement": {
            "text_region_recall_delta": _round_metric(
                korean_detector["detection"]["text_region_recall"]
                - baseline["detection"]["text_region_recall"]
            ),
            "false_positive_delta": (
                korean_detector["detection"]["false_positives"]
                - baseline["detection"]["false_positives"]
            ),
            "mean_matched_iou_delta": _round_metric(
                korean_detector["detection"]["mean_matched_iou"]
                - baseline["detection"]["mean_matched_iou"]
            ),
            "fragmentation_error_delta": (
                korean_detector["detection"]["fragmentation_errors"]
                - baseline["detection"]["fragmentation_errors"]
            ),
            "merge_error_delta": (
                korean_detector["detection"]["merge_errors"]
                - baseline["detection"]["merge_errors"]
            ),
        },
    }


async def run_local_tesseract_benchmark(
    fixture_dir: Path,
    *,
    source_language: str = "ko",
) -> dict[str, Any]:
    fixtures = load_local_fixtures(fixture_dir)
    provider = TesseractOCRProvider()
    baseline_predictions, baseline_elapsed = await _provider_predictions(
        provider,
        fixtures,
        source_language=source_language,
        korean_detection=False,
    )
    detector_predictions, detector_elapsed = await _provider_predictions(
        provider,
        fixtures,
        source_language=source_language,
        korean_detection=True,
    )
    manual_predictions, manual_elapsed = await _manual_crop_predictions(
        provider,
        fixtures,
        source_language=source_language,
    )
    return {
        "fixture_source": str(fixture_dir),
        "recognition_evidence": "Actual Tesseract OCR on local-only fixtures and manual crops.",
        "manual_crop_runtime_seconds": _round_metric(manual_elapsed),
        "baseline": evaluate_predictions(
            fixtures,
            baseline_predictions,
            manual_predictions,
            elapsed_seconds=baseline_elapsed,
        ),
        "korean_detector": evaluate_predictions(
            fixtures,
            detector_predictions,
            manual_predictions,
            elapsed_seconds=detector_elapsed,
        ),
    }


def load_local_fixtures(fixture_dir: Path) -> list[BenchmarkFixture]:
    manifest = json.loads((fixture_dir / "manifest.json").read_text())
    fixtures: list[BenchmarkFixture] = []
    for payload in manifest["fixtures"]:
        image_path = fixture_dir / payload["image"]
        regions = [
            BenchmarkRegion(
                bounding_box=_validated_box(region["bounding_box"]),
                text=str(region["text"]),
            )
            for region in payload["regions"]
        ]
        fixtures.append(
            BenchmarkFixture(
                name=str(payload["name"]),
                image_bytes=image_path.read_bytes(),
                regions=regions,
                baseline_predictions=[],
            )
        )
    return fixtures


def evaluate_predictions(
    fixtures: list[BenchmarkFixture],
    predictions: dict[str, list[BenchmarkRegion]],
    manual_predictions: dict[str, list[BenchmarkRegion]],
    *,
    elapsed_seconds: float,
) -> dict[str, Any]:
    truth_count = 0
    prediction_count = 0
    matches: list[tuple[BenchmarkRegion, BenchmarkRegion, float]] = []
    fragmentation_errors = 0
    merge_errors = 0
    auto_text_pairs: list[tuple[str, str]] = []
    manual_text_pairs: list[tuple[str, str]] = []

    for fixture in fixtures:
        truth = fixture.regions
        automatic = predictions.get(fixture.name, [])
        manual = manual_predictions.get(fixture.name, [])
        fixture_matches = _match_regions(truth, automatic)
        manual_matches = _match_regions(truth, manual)
        matched_truth = {id(actual) for actual, _predicted, _iou in fixture_matches}
        matched_predictions = {id(predicted) for _actual, predicted, _iou in fixture_matches}

        truth_count += len(truth)
        prediction_count += len(automatic)
        matches.extend(fixture_matches)
        fragmentation_errors += sum(
            _overlapping_region_count(actual, automatic) > 1
            for actual in truth
        )
        merge_errors += sum(
            _overlapping_region_count(predicted, truth) > 1
            for predicted in automatic
        )
        auto_text_pairs.extend(
            (actual.text, predicted.text)
            for actual, predicted, _iou in fixture_matches
        )
        auto_text_pairs.extend(
            (actual.text, "")
            for actual in truth
            if id(actual) not in matched_truth
        )
        auto_text_pairs.extend(
            ("", predicted.text)
            for predicted in automatic
            if id(predicted) not in matched_predictions
        )
        manual_text_pairs.extend(
            (actual.text, predicted.text)
            for actual, predicted, _iou in manual_matches
        )

    matched_count = len(matches)
    correct_ocr_count = sum(
        _normalize_text(actual.text) == _normalize_text(predicted.text)
        for actual, predicted, _iou in matches
    )
    manual_cer = _cer_for_pairs(manual_text_pairs)
    automatic_cer = _cer_for_pairs(auto_text_pairs)
    return {
        "fixture_count": len(fixtures),
        "detection": {
            "ground_truth_regions": truth_count,
            "detected_regions": prediction_count,
            "matched_regions": matched_count,
            "text_region_recall": _ratio(matched_count, truth_count),
            "false_positives": prediction_count - matched_count,
            "mean_matched_iou": _round_metric(
                sum(iou for _actual, _predicted, iou in matches) / max(1, matched_count)
            ),
            "fragmentation_errors": fragmentation_errors,
            "merge_errors": merge_errors,
        },
        "recognition": {
            "correctly_ocred_detected_region_rate": _ratio(
                correct_ocr_count,
                matched_count,
            ),
            "automatic_cer": automatic_cer,
            "manual_crop_cer": manual_cer,
            "manual_vs_automatic_cer_delta": _round_metric(automatic_cer - manual_cer),
        },
        "runtime": {
            "seconds": _round_metric(elapsed_seconds),
            "peak_rss_platform_units": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        },
    }


async def _provider_predictions(
    provider: TesseractOCRProvider,
    fixtures: list[BenchmarkFixture],
    *,
    source_language: str,
    korean_detection: bool,
) -> tuple[dict[str, list[BenchmarkRegion]], float]:
    started = time.perf_counter()
    with _tesseract_detection(korean_detection):
        predictions = {
            fixture.name: [
                BenchmarkRegion(region.bounding_box, region.text)
                for region in await provider.detect_and_read(
                    fixture.image_bytes,
                    source_language,
                )
            ]
            for fixture in fixtures
        }
    return predictions, time.perf_counter() - started


async def _manual_crop_predictions(
    provider: TesseractOCRProvider,
    fixtures: list[BenchmarkFixture],
    *,
    source_language: str,
) -> tuple[dict[str, list[BenchmarkRegion]], float]:
    started = time.perf_counter()
    predictions: dict[str, list[BenchmarkRegion]] = {}
    with _tesseract_detection(False):
        for fixture in fixtures:
            fixture_predictions: list[BenchmarkRegion] = []
            for region in fixture.regions:
                crop_bytes = _crop_image_bytes(fixture.image_bytes, region.bounding_box)
                crop_regions = await provider.detect_and_read(crop_bytes, source_language)
                fixture_predictions.append(
                    BenchmarkRegion(
                        bounding_box=region.bounding_box,
                        text="\n".join(crop_region.text for crop_region in crop_regions),
                    )
                )
            predictions[fixture.name] = fixture_predictions
    return predictions, time.perf_counter() - started


@contextmanager
def _tesseract_detection(enabled: bool) -> Iterator[None]:
    previous = settings.tesseract_korean_text_detection
    settings.tesseract_korean_text_detection = enabled
    try:
        yield
    finally:
        settings.tesseract_korean_text_detection = previous


def _synthetic_fixtures() -> list[BenchmarkFixture]:
    return [
        _missed_region_fixture(),
        _fragmented_region_fixture(),
        _false_positive_fixture(),
        _merged_region_fixture(),
    ]


def _missed_region_fixture() -> BenchmarkFixture:
    image, draw = _new_page()
    first = _draw_pseudo_text(draw, left=24, top=30, lines=[4, 4], text="안녕하세요")
    second = _draw_pseudo_text(draw, left=210, top=150, lines=[4, 3], text="고마워요")
    return _fixture("missed-region", image, [first, second], [first])


def _fragmented_region_fixture() -> BenchmarkFixture:
    image, draw = _new_page()
    region = _draw_pseudo_text(draw, left=130, top=80, lines=[5, 5], text="다시 만나요")
    first_line = BenchmarkRegion(
        bounding_box=_padded_box({"x": 130, "y": 80, "width": 56, "height": 12}),
        text="다시",
    )
    second_line = BenchmarkRegion(
        bounding_box=_padded_box({"x": 130, "y": 98, "width": 56, "height": 12}),
        text="만나요",
    )
    return _fixture("fragmented-region", image, [region], [first_line, second_line])


def _false_positive_fixture() -> BenchmarkFixture:
    image, draw = _new_page()
    region = _draw_pseudo_text(draw, left=36, top=168, lines=[4], text="괜찮아요")
    false_positive = BenchmarkRegion(
        bounding_box={"x": 224, "y": 28, "width": 72, "height": 56},
        text="OCR NOISE",
    )
    draw.rectangle((224, 28, 296, 84), fill="black")
    return _fixture("false-positive", image, [region], [region, false_positive])


def _merged_region_fixture() -> BenchmarkFixture:
    image, draw = _new_page()
    first = _draw_pseudo_text(draw, left=36, top=40, lines=[3], text="왼쪽")
    second = _draw_pseudo_text(draw, left=220, top=45, lines=[3], text="오른쪽")
    merged = BenchmarkRegion(
        bounding_box=_union_boxes([first.bounding_box, second.bounding_box]),
        text="왼쪽 오른쪽",
    )
    return _fixture("merged-region", image, [first, second], [merged])


def _new_page() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", (360, 260), "white")
    return image, ImageDraw.Draw(image)


def _draw_pseudo_text(
    draw: ImageDraw.ImageDraw,
    *,
    left: int,
    top: int,
    lines: list[int],
    text: str,
) -> BenchmarkRegion:
    glyph_width = 8
    glyph_height = 12
    horizontal_step = 12
    vertical_step = 18
    for row, glyph_count in enumerate(lines):
        for column in range(glyph_count):
            x = left + column * horizontal_step
            y = top + row * vertical_step
            draw.rectangle((x, y, x + glyph_width - 1, y + glyph_height - 1), fill="black")
    content = {
        "x": left,
        "y": top,
        "width": max(lines) * horizontal_step - (horizontal_step - glyph_width),
        "height": len(lines) * vertical_step - (vertical_step - glyph_height),
    }
    return BenchmarkRegion(bounding_box=_padded_box(content), text=text)


def _fixture(
    name: str,
    image: Image.Image,
    regions: list[BenchmarkRegion],
    baseline_predictions: list[BenchmarkRegion],
) -> BenchmarkFixture:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return BenchmarkFixture(
        name=name,
        image_bytes=buffer.getvalue(),
        regions=regions,
        baseline_predictions=baseline_predictions,
    )


def _oracle_text_predictions(
    blocks: list[Any],
    truth: list[BenchmarkRegion],
) -> list[BenchmarkRegion]:
    predictions: list[BenchmarkRegion] = []
    for block in blocks:
        match = max(
            truth,
            key=lambda region: _iou(block.bounding_box, region.bounding_box),
            default=None,
        )
        text = match.text if match and _iou(block.bounding_box, match.bounding_box) >= 0.2 else ""
        predictions.append(BenchmarkRegion(block.bounding_box, text))
    return predictions


def _match_regions(
    truth: list[BenchmarkRegion],
    predictions: list[BenchmarkRegion],
) -> list[tuple[BenchmarkRegion, BenchmarkRegion, float]]:
    candidates = sorted(
        (
            (_iou(actual.bounding_box, predicted.bounding_box), actual, predicted)
            for actual in truth
            for predicted in predictions
        ),
        key=lambda candidate: candidate[0],
        reverse=True,
    )
    matches: list[tuple[BenchmarkRegion, BenchmarkRegion, float]] = []
    matched_truth: set[int] = set()
    matched_predictions: set[int] = set()
    for iou, actual, predicted in candidates:
        if iou < 0.5 or id(actual) in matched_truth or id(predicted) in matched_predictions:
            continue
        matches.append((actual, predicted, iou))
        matched_truth.add(id(actual))
        matched_predictions.add(id(predicted))
    return matches


def _overlapping_region_count(region: BenchmarkRegion, candidates: list[BenchmarkRegion]) -> int:
    return sum(
        _intersection_over_area(region.bounding_box, candidate.bounding_box) >= 0.1
        for candidate in candidates
    )


def _iou(first: Box, second: Box) -> float:
    intersection = _intersection_area(first, second)
    union = _box_area(first) + _box_area(second) - intersection
    return intersection / union if union else 0.0


def _intersection_over_area(first: Box, second: Box) -> float:
    return _intersection_area(first, second) / max(1, _box_area(first))


def _intersection_area(first: Box, second: Box) -> int:
    width = max(
        0,
        min(first["x"] + first["width"], second["x"] + second["width"])
        - max(first["x"], second["x"]),
    )
    height = max(
        0,
        min(first["y"] + first["height"], second["y"] + second["height"])
        - max(first["y"], second["y"]),
    )
    return width * height


def _box_area(box: Box) -> int:
    return box["width"] * box["height"]


def _padded_box(box: Box) -> Box:
    return {
        "x": max(0, box["x"] - 2),
        "y": max(0, box["y"] - 2),
        "width": box["width"] + 4,
        "height": box["height"] + 4,
    }


def _union_boxes(boxes: list[Box]) -> Box:
    left = min(box["x"] for box in boxes)
    top = min(box["y"] for box in boxes)
    right = max(box["x"] + box["width"] for box in boxes)
    bottom = max(box["y"] + box["height"] for box in boxes)
    return {"x": left, "y": top, "width": right - left, "height": bottom - top}


def _validated_box(box: dict[str, Any]) -> Box:
    validated = {
        "x": int(box["x"]),
        "y": int(box["y"]),
        "width": int(box["width"]),
        "height": int(box["height"]),
    }
    if (
        validated["x"] < 0
        or validated["y"] < 0
        or validated["width"] <= 0
        or validated["height"] <= 0
    ):
        raise ValueError(f"Invalid benchmark region box: {validated}")
    return validated


def _cer_for_pairs(pairs: list[tuple[str, str]]) -> float:
    total_characters = sum(len(_normalize_text(expected)) for expected, _actual in pairs)
    edits = sum(
        _edit_distance(_normalize_text(expected), _normalize_text(actual))
        for expected, actual in pairs
    )
    return _ratio(edits, total_characters)


def _edit_distance(first: str, second: str) -> int:
    previous = list(range(len(second) + 1))
    for index, first_character in enumerate(first, start=1):
        current = [index]
        for second_index, second_character in enumerate(second, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[second_index] + 1,
                    previous[second_index - 1] + (first_character != second_character),
                )
            )
        previous = current
    return previous[-1]


def _normalize_text(text: str) -> str:
    return "".join(text.split())


def _ratio(numerator: int, denominator: int) -> float:
    return _round_metric(numerator / denominator) if denominator else 0.0


def _round_metric(value: float) -> float:
    return round(value, 6)
