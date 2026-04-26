from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from PIL import Image
import io

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
    async def detect_and_read(self, image_bytes: bytes, source_language: str = "auto") -> list[OCRRegion]:
        ...


class MockOCRProvider:
    async def detect_and_read(self, image_bytes: bytes, source_language: str = "auto") -> list[OCRRegion]:
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

    async def detect_and_read(self, image_bytes: bytes, source_language: str = "auto") -> list[OCRRegion]:
        import asyncio
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
    if settings.ocr_provider == "easyocr":
        return EasyOCRProvider()
    return MockOCRProvider()

