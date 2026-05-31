from __future__ import annotations

import asyncio
import io
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Protocol

from PIL import Image, ImageOps

from app.core.config import settings
from app.core.enums import RegionType


@dataclass(frozen=True)
class OCRRegion:
    region_index: int
    bounding_box: dict
    polygon: list | None
    text: str
    language: str | None
    confidence: float
    region_type: str = RegionType.UNKNOWN.value


@dataclass(frozen=True)
class DetectedTextBlock:
    bounding_box: dict[str, int]
    polygon: list[list[int]]


class OCRProvider(Protocol):
    async def detect_and_read(
        self,
        image_bytes: bytes,
        source_language: str = "auto",
    ) -> list[OCRRegion]:
        ...


class MockOCRProvider:
    async def detect_and_read(
        self,
        image_bytes: bytes,
        source_language: str = "auto",
    ) -> list[OCRRegion]:
        with Image.open(io.BytesIO(image_bytes)) as image:
            width, height = image.size

        box_width = max(120, int(width * 0.38))
        box_height = max(70, int(height * 0.12))
        return [
            OCRRegion(
                region_index=0,
                bounding_box={
                    "x": max(0, (width - box_width) // 2),
                    "y": max(0, int(height * 0.08)),
                    "width": box_width,
                    "height": box_height,
                },
                polygon=None,
                text="Sample detected text",
                language=None if source_language == "auto" else source_language,
                confidence=0.95,
                region_type=RegionType.SPEECH.value,
            )
        ]


_TESSERACT_LANGUAGE_ALIASES = {
    "ja": "jpn",
    "jp": "jpn",
    "japanese": "jpn",
    "ko": "kor",
    "kr": "kor",
    "korean": "kor",
}


def _normalize_tesseract_language(source_language: str | None) -> str:
    raw = (source_language or "").strip().lower()
    if raw == "auto":
        raw = (
            settings.tesseract_auto_language or settings.tesseract_default_language
        ).strip().lower()
    if not raw:
        raw = settings.tesseract_default_language.strip().lower()
    if "+" in raw:
        normalized_parts = [
            _TESSERACT_LANGUAGE_ALIASES.get(part.strip(), part.strip())
            for part in raw.split("+")
            if part.strip()
        ]
        return "+".join(normalized_parts)
    return _TESSERACT_LANGUAGE_ALIASES.get(raw, raw)


class TesseractOCRProvider:
    async def detect_and_read(
        self,
        image_bytes: bytes,
        source_language: str = "auto",
    ) -> list[OCRRegion]:
        tesseract_language = _normalize_tesseract_language(source_language)
        region_language = None if source_language.strip().lower() == "auto" else tesseract_language
        if _should_detect_korean_text_blocks(source_language, tesseract_language):
            blocks = _detect_korean_text_blocks(image_bytes)
            if blocks:
                regions = await self._read_detected_blocks(
                    image_bytes,
                    blocks,
                    tesseract_language,
                    region_language,
                )
                if regions:
                    return regions
        return await self._read_image(image_bytes, tesseract_language, region_language)

    async def _read_detected_blocks(
        self,
        image_bytes: bytes,
        blocks: list[DetectedTextBlock],
        tesseract_language: str,
        region_language: str | None,
    ) -> list[OCRRegion]:
        regions: list[OCRRegion] = []
        for block in blocks:
            crop_bytes = _crop_image_bytes(image_bytes, block.bounding_box)
            crop_regions = await self._read_image(
                crop_bytes,
                tesseract_language,
                region_language,
            )
            text_parts = [region.text.strip() for region in crop_regions if region.text.strip()]
            if not text_parts:
                continue
            confidences = [region.confidence for region in crop_regions]
            regions.append(
                OCRRegion(
                    region_index=len(regions),
                    bounding_box=block.bounding_box,
                    polygon=block.polygon,
                    text="\n".join(text_parts),
                    language=region_language,
                    confidence=sum(confidences) / len(confidences),
                    region_type=RegionType.UNKNOWN.value,
                )
            )
        return regions

    async def _read_image(
        self,
        image_bytes: bytes,
        tesseract_language: str,
        region_language: str | None,
    ) -> list[OCRRegion]:
        image, scale = _prepare_tesseract_image(image_bytes)
        data = await asyncio.to_thread(
            self._image_to_data,
            image,
            tesseract_language,
            _tesseract_config(),
        )
        regions = _regions_from_tesseract_data(data, region_language, scale)
        if settings.tesseract_preprocess and _should_retry_without_preprocessing(
            regions,
            tesseract_language,
        ):
            raw_image, raw_scale = _prepare_tesseract_image(image_bytes, preprocess=False)
            raw_data = await asyncio.to_thread(
                self._image_to_data,
                raw_image,
                tesseract_language,
                _tesseract_config(),
            )
            raw_regions = _regions_from_tesseract_data(raw_data, region_language, raw_scale)
            if _ocr_text_score(raw_regions, tesseract_language) > _ocr_text_score(
                regions,
                tesseract_language,
            ):
                return raw_regions
        return regions

    def _image_to_data(
        self,
        image: Image.Image,
        language: str,
        config: str,
    ) -> dict[str, list[Any]]:
        import pytesseract  # type: ignore[import-not-found]

        if settings.tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd
        return pytesseract.image_to_data(
            image,
            lang=language,
            config=config,
            output_type=pytesseract.Output.DICT,
        )


def _prepare_tesseract_image(
    image_bytes: bytes,
    preprocess: bool | None = None,
) -> tuple[Image.Image, float]:
    with Image.open(io.BytesIO(image_bytes)) as image:
        prepared = image.convert("RGB")

    scale = _tesseract_scale_factor(prepared.size)
    if scale > 1.0:
        width, height = prepared.size
        prepared = prepared.resize(
            (round(width * scale), round(height * scale)),
            Image.Resampling.LANCZOS,
        )

    should_preprocess = settings.tesseract_preprocess if preprocess is None else preprocess
    if not should_preprocess:
        return prepared, scale

    grayscale = ImageOps.grayscale(prepared)
    grayscale = ImageOps.autocontrast(grayscale)
    threshold = max(0, min(255, settings.tesseract_threshold))
    if threshold == 0:
        return grayscale, scale
    thresholded = grayscale.point(lambda pixel: 255 if pixel > threshold else 0, mode="1")
    return thresholded.convert("L"), scale


def _crop_image_bytes(image_bytes: bytes, bounding_box: dict[str, int]) -> bytes:
    with Image.open(io.BytesIO(image_bytes)) as image:
        source = image.convert("RGB")
        left = bounding_box["x"]
        top = bounding_box["y"]
        right = left + bounding_box["width"]
        bottom = top + bounding_box["height"]
        crop = source.crop((left, top, right, bottom))

    buffer = io.BytesIO()
    crop.save(buffer, format="PNG")
    return buffer.getvalue()


def _should_detect_korean_text_blocks(source_language: str, tesseract_language: str) -> bool:
    if not settings.tesseract_korean_text_detection:
        return False
    normalized_source = source_language.strip().lower()
    return (
        normalized_source in {"ko", "kr", "korean", "kor"}
        or tesseract_language.strip().lower() == "kor"
    )


def _detect_korean_text_blocks(image_bytes: bytes) -> list[DetectedTextBlock]:
    import cv2
    import numpy as np

    with Image.open(io.BytesIO(image_bytes)) as image:
        grayscale = np.array(ImageOps.grayscale(image))

    height, width = grayscale.shape
    _, foreground = cv2.threshold(
        grayscale,
        0,
        255,
        cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU,
    )
    label_count, labels, stats, _centroids = cv2.connectedComponentsWithStats(
        foreground,
        connectivity=8,
    )

    min_component_width = max(2, round(width * 0.003))
    min_component_height = max(3, round(height * 0.006))
    max_component_width = max(min_component_width, round(width * 0.15))
    max_component_height = max(min_component_height, round(height * 0.12))
    min_component_area = max(4, round(width * height * 0.00001))
    max_component_area = max(min_component_area, round(width * height * 0.01))

    component_mask = np.zeros_like(foreground)
    component_boxes: list[dict[str, int]] = []
    for label in range(1, label_count):
        left, top, box_width, box_height, area = [
            int(value) for value in stats[label]
        ]
        if not (
            min_component_width <= box_width <= max_component_width
            and min_component_height <= box_height <= max_component_height
            and min_component_area <= area <= max_component_area
        ):
            continue
        component_mask[labels == label] = 255
        component_boxes.append(
            {
                "x": left,
                "y": top,
                "width": box_width,
                "height": box_height,
            }
        )

    if not component_boxes:
        return []

    horizontal_gap = max(5, round(width * 0.018))
    line_mask = cv2.dilate(
        component_mask,
        cv2.getStructuringElement(cv2.MORPH_RECT, (horizontal_gap, 1)),
    )
    contours, _hierarchy = cv2.findContours(
        line_mask,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )
    lines: list[dict[str, int]] = []
    for contour in contours:
        contour_box = _cv2_bounding_box(cv2.boundingRect(contour))
        line_components = [
            box for box in component_boxes if _boxes_intersect(box, contour_box)
        ]
        if len(line_components) < 2:
            continue
        lines.append(_union_boxes(line_components))

    blocks = _merge_text_lines(lines)
    padding = max(2, round(min(width, height) * 0.008))
    padded_blocks = [
        _pad_box(block, padding=padding, image_width=width, image_height=height)
        for block in blocks
    ]
    return [
        DetectedTextBlock(
            bounding_box=block,
            polygon=_polygon_for_box(block),
        )
        for block in sorted(padded_blocks, key=lambda block: (block["y"], block["x"]))
    ]


def _cv2_bounding_box(values: tuple[int, int, int, int]) -> dict[str, int]:
    left, top, width, height = values
    return {"x": left, "y": top, "width": width, "height": height}


def _boxes_intersect(first: dict[str, int], second: dict[str, int]) -> bool:
    return not (
        first["x"] + first["width"] <= second["x"]
        or second["x"] + second["width"] <= first["x"]
        or first["y"] + first["height"] <= second["y"]
        or second["y"] + second["height"] <= first["y"]
    )


def _union_boxes(boxes: list[dict[str, int]]) -> dict[str, int]:
    left = min(box["x"] for box in boxes)
    top = min(box["y"] for box in boxes)
    right = max(box["x"] + box["width"] for box in boxes)
    bottom = max(box["y"] + box["height"] for box in boxes)
    return {"x": left, "y": top, "width": right - left, "height": bottom - top}


def _merge_text_lines(lines: list[dict[str, int]]) -> list[dict[str, int]]:
    remaining = sorted(lines, key=lambda box: (box["y"], box["x"]))
    merged: list[dict[str, int]] = []
    while remaining:
        block = remaining.pop(0)
        changed = True
        while changed:
            changed = False
            next_remaining: list[dict[str, int]] = []
            for candidate in remaining:
                if _should_merge_text_lines(block, candidate):
                    block = _union_boxes([block, candidate])
                    changed = True
                else:
                    next_remaining.append(candidate)
            remaining = next_remaining
        merged.append(block)
    return merged


def _should_merge_text_lines(first: dict[str, int], second: dict[str, int]) -> bool:
    horizontal_overlap = max(
        0,
        min(first["x"] + first["width"], second["x"] + second["width"])
        - max(first["x"], second["x"]),
    )
    horizontal_overlap_ratio = horizontal_overlap / max(
        1,
        min(first["width"], second["width"]),
    )
    vertical_gap = max(
        0,
        max(first["y"], second["y"])
        - min(first["y"] + first["height"], second["y"] + second["height"]),
    )
    return (
        horizontal_overlap_ratio >= 0.35
        and vertical_gap <= max(12, round(max(first["height"], second["height"]) * 0.9))
    )


def _pad_box(
    box: dict[str, int],
    *,
    padding: int,
    image_width: int,
    image_height: int,
) -> dict[str, int]:
    left = max(0, box["x"] - padding)
    top = max(0, box["y"] - padding)
    right = min(image_width, box["x"] + box["width"] + padding)
    bottom = min(image_height, box["y"] + box["height"] + padding)
    return {"x": left, "y": top, "width": right - left, "height": bottom - top}


def _polygon_for_box(box: dict[str, int]) -> list[list[int]]:
    left = box["x"]
    top = box["y"]
    right = left + box["width"]
    bottom = top + box["height"]
    return [[left, top], [right, top], [right, bottom], [left, bottom]]


def _should_retry_without_preprocessing(regions: list[OCRRegion], language: str) -> bool:
    if not regions:
        return True
    normalized_language = language.lower()
    if any(language_code in normalized_language for language_code in ("kor", "jpn")):
        text = " ".join(region.text for region in regions).strip()
        if not _contains_expected_script(text, language):
            return True
    return _ocr_text_score(regions, language) < 1.0


def _ocr_text_score(regions: list[OCRRegion], language: str) -> float:
    text = " ".join(region.text for region in regions).strip()
    if not text:
        return 0.0

    score = min(len(text) / 8, 1.0)
    if _contains_expected_script(text, language):
        score += 1.0
    if regions:
        score += sum(region.confidence for region in regions) / len(regions)
    return score


def _contains_expected_script(text: str, language: str) -> bool:
    normalized = language.lower()
    for character in text:
        codepoint = ord(character)
        if "kor" in normalized and (
            0xAC00 <= codepoint <= 0xD7AF
            or 0x1100 <= codepoint <= 0x11FF
            or 0x3130 <= codepoint <= 0x318F
        ):
            return True
        if "jpn" in normalized and (
            0x3040 <= codepoint <= 0x30FF
            or 0x31F0 <= codepoint <= 0x31FF
            or 0x4E00 <= codepoint <= 0x9FFF
        ):
            return True
    return not any(language_code in normalized for language_code in ("kor", "jpn"))


def _tesseract_scale_factor(size: tuple[int, int]) -> float:
    min_dimension = max(0, settings.tesseract_upscale_min_dimension)
    if min_dimension == 0:
        return 1.0
    long_side = max(size)
    if long_side >= min_dimension or long_side == 0:
        return 1.0
    return min(settings.tesseract_upscale_max_factor, min_dimension / long_side)


def _tesseract_config() -> str:
    parts = [f"--oem {settings.tesseract_oem}", f"--psm {settings.tesseract_psm}"]
    if settings.tesseract_data_path:
        parts.append(f'--tessdata-dir "{settings.tesseract_data_path}"')
    return " ".join(parts)


def _regions_from_tesseract_data(
    data: dict[str, list[Any]],
    language: str | None,
    scale: float = 1.0,
) -> list[OCRRegion]:
    grouped_rows: dict[tuple[int, int, int], list[dict[str, Any]]] = defaultdict(list)
    row_count = _tesseract_row_count(data)
    for index in range(row_count):
        text = str(_data_value(data, "text", index, "")).strip()
        if not text:
            continue
        grouped_rows[
            (
                _int_data_value(data, "block_num", index),
                _int_data_value(data, "par_num", index),
                _int_data_value(data, "line_num", index),
            )
        ].append(
            {
                "text": text,
                "left": _int_data_value(data, "left", index),
                "top": _int_data_value(data, "top", index),
                "width": _int_data_value(data, "width", index),
                "height": _int_data_value(data, "height", index),
                "confidence": _confidence_data_value(data, "conf", index),
            }
        )

    regions: list[OCRRegion] = []
    safe_scale = max(scale, 0.001)
    for region_index, rows in enumerate(grouped_rows.values()):
        left = min(row["left"] for row in rows)
        top = min(row["top"] for row in rows)
        right = max(row["left"] + row["width"] for row in rows)
        bottom = max(row["top"] + row["height"] for row in rows)
        confidences = [
            confidence for row in rows if (confidence := row["confidence"]) is not None
        ]
        confidence = sum(confidences) / len(confidences) if confidences else 0.0
        regions.append(
            OCRRegion(
                region_index=region_index,
                bounding_box={
                    "x": round(left / safe_scale),
                    "y": round(top / safe_scale),
                    "width": max(1, round((right - left) / safe_scale)),
                    "height": max(1, round((bottom - top) / safe_scale)),
                },
                polygon=None,
                text=" ".join(row["text"] for row in rows),
                language=language,
                confidence=confidence,
                region_type=RegionType.UNKNOWN.value,
            )
        )
    return regions


def _tesseract_row_count(data: dict[str, list[Any]]) -> int:
    return max((len(value) for value in data.values() if isinstance(value, list)), default=0)


def _data_value(data: dict[str, list[Any]], key: str, index: int, default: Any = None) -> Any:
    values = data.get(key)
    if values is None or index >= len(values):
        return default
    return values[index]


def _int_data_value(data: dict[str, list[Any]], key: str, index: int) -> int:
    try:
        return int(float(_data_value(data, key, index, 0)))
    except (TypeError, ValueError):
        return 0


def _confidence_data_value(
    data: dict[str, list[Any]],
    key: str,
    index: int,
) -> float | None:
    try:
        confidence = float(_data_value(data, key, index, -1))
    except (TypeError, ValueError):
        return None
    if confidence < 0:
        return None
    return max(0.0, min(1.0, confidence / 100))


class EasyOCRProvider:
    def __init__(self) -> None:
        import easyocr  # type: ignore

        self.easyocr = easyocr
        self._readers: dict[tuple[str, ...], object] = {}

    def _reader_for(self, source_language: str) -> object:
        languages = ("en",) if source_language == "auto" else (source_language, "en")
        if languages not in self._readers:
            self._readers[languages] = self.easyocr.Reader(list(languages), gpu=False)
        return self._readers[languages]

    async def detect_and_read(
        self,
        image_bytes: bytes,
        source_language: str = "auto",
    ) -> list[OCRRegion]:
        import numpy as np

        with Image.open(io.BytesIO(image_bytes)) as image:
            array = np.array(image.convert("RGB"))
        reader = self._reader_for(source_language)
        results = await asyncio.to_thread(reader.readtext, array)

        regions: list[OCRRegion] = []
        for index, (polygon, text, confidence) in enumerate(results):
            xs = [int(point[0]) for point in polygon]
            ys = [int(point[1]) for point in polygon]
            regions.append(
                OCRRegion(
                    region_index=index,
                    bounding_box={
                        "x": min(xs),
                        "y": min(ys),
                        "width": max(xs) - min(xs),
                        "height": max(ys) - min(ys),
                    },
                    polygon=[[int(x), int(y)] for x, y in polygon],
                    text=text,
                    language=None if source_language == "auto" else source_language,
                    confidence=float(confidence),
                    region_type=RegionType.UNKNOWN.value,
                )
            )
        return regions


def get_ocr_provider() -> OCRProvider:
    if settings.ocr_provider == "tesseract":
        return TesseractOCRProvider()
    if settings.ocr_provider == "easyocr":
        return EasyOCRProvider()
    return MockOCRProvider()
