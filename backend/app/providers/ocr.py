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
        image, scale = _prepare_tesseract_image(image_bytes)
        tesseract_language = _normalize_tesseract_language(source_language)
        region_language = None if source_language.strip().lower() == "auto" else tesseract_language
        data = await asyncio.to_thread(
            self._image_to_data,
            image,
            tesseract_language,
            _tesseract_config(),
        )
        return _regions_from_tesseract_data(data, region_language, scale)

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


def _prepare_tesseract_image(image_bytes: bytes) -> tuple[Image.Image, float]:
    with Image.open(io.BytesIO(image_bytes)) as image:
        prepared = image.convert("RGB")

    scale = _tesseract_scale_factor(prepared.size)
    if scale > 1.0:
        width, height = prepared.size
        prepared = prepared.resize(
            (round(width * scale), round(height * scale)),
            Image.Resampling.LANCZOS,
        )

    if not settings.tesseract_preprocess:
        return prepared, scale

    grayscale = ImageOps.grayscale(prepared)
    grayscale = ImageOps.autocontrast(grayscale)
    threshold = max(0, min(255, settings.tesseract_threshold))
    if threshold == 0:
        return grayscale, scale
    thresholded = grayscale.point(lambda pixel: 255 if pixel > threshold else 0, mode="1")
    return thresholded.convert("L"), scale


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
