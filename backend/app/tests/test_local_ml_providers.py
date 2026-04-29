from __future__ import annotations

import io
from pathlib import Path

import pytest
from PIL import Image

from app.core.config import settings
from app.core.enums import RegionType
from app.providers.ocr import (
    MockOCRProvider,
    TesseractOCRProvider,
    _normalize_tesseract_language,
    get_ocr_provider,
)
from app.providers.translation import (
    MockTranslationProvider,
    OpusMTTranslationProvider,
    _encode_sentencepiece,
    _infer_opus_source_language,
    _normalize_opus_source_language,
    _normalize_opus_target_language,
    _OpusMTModelBundle,
    get_translation_provider,
)


def _png_bytes() -> bytes:
    image = Image.new("RGB", (320, 240), "white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_tesseract_provider_selection(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ocr_provider", "tesseract")

    assert isinstance(get_ocr_provider(), TesseractOCRProvider)


@pytest.mark.asyncio
async def test_tesseract_output_converts_to_line_regions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    data = {
        "block_num": [1, 1, 1, 1],
        "par_num": [1, 1, 1, 1],
        "line_num": [1, 1, 1, 2],
        "left": [10, 40, 90, 15],
        "top": [20, 20, 21, 70],
        "width": [24, 42, 12, 44],
        "height": [12, 12, 10, 16],
        "conf": ["95.0", "75.0", "-1", "60.0"],
        "text": ["こんにちは", "世界", "", "次"],
    }

    provider = TesseractOCRProvider()
    monkeypatch.setattr(settings, "tesseract_preprocess", False)
    monkeypatch.setattr(provider, "_image_to_data", lambda *_args: data)

    regions = await provider.detect_and_read(_png_bytes(), "ja")

    assert len(regions) == 2
    assert regions[0].bounding_box == {"x": 10, "y": 20, "width": 72, "height": 12}
    assert regions[0].text == "こんにちは 世界"
    assert regions[0].language == "jpn"
    assert regions[0].confidence == pytest.approx(0.85)
    assert regions[0].polygon is None
    assert regions[0].region_type == RegionType.UNKNOWN.value
    assert regions[1].text == "次"
    assert regions[1].bounding_box == {"x": 15, "y": 70, "width": 44, "height": 16}
    assert regions[1].confidence == pytest.approx(0.6)


@pytest.mark.asyncio
async def test_tesseract_retries_raw_image_when_preprocessing_drops_korean_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bad_data = {
        "block_num": [1],
        "par_num": [1],
        "line_num": [1],
        "left": [10],
        "top": [20],
        "width": [24],
        "height": [12],
        "conf": ["56.0"],
        "text": ["02 OCR NOISE"],
    }
    good_data = {
        "block_num": [1],
        "par_num": [1],
        "line_num": [1],
        "left": [40],
        "top": [80],
        "width": [200],
        "height": [40],
        "conf": ["94.0"],
        "text": ["저 사람이"],
    }
    calls: list[str] = []

    provider = TesseractOCRProvider()

    def fake_image_to_data(*_args: object) -> dict[str, list[object]]:
        calls.append("ocr")
        return bad_data if len(calls) == 1 else good_data

    monkeypatch.setattr(settings, "tesseract_preprocess", True)
    monkeypatch.setattr(provider, "_image_to_data", fake_image_to_data)

    regions = await provider.detect_and_read(_png_bytes(), "ko")

    assert len(calls) == 2
    assert len(regions) == 1
    assert regions[0].text == "저 사람이"
    assert regions[0].language == "kor"
    assert regions[0].confidence == pytest.approx(0.94)


def test_tesseract_language_aliases(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "tesseract_default_language", "kor")
    monkeypatch.setattr(settings, "tesseract_auto_language", "kor+jpn")

    assert _normalize_tesseract_language("ja") == "jpn"
    assert _normalize_tesseract_language("jp") == "jpn"
    assert _normalize_tesseract_language("japanese") == "jpn"
    assert _normalize_tesseract_language("ko") == "kor"
    assert _normalize_tesseract_language("kr") == "kor"
    assert _normalize_tesseract_language("korean") == "kor"
    assert _normalize_tesseract_language("auto") == "kor+jpn"


def test_opus_mt_provider_selection(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "translation_provider", "opus_mt")

    assert isinstance(get_translation_provider(), OpusMTTranslationProvider)


def test_opus_mt_model_paths(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    provider = OpusMTTranslationProvider()
    model_root = tmp_path / "opus-mt"
    custom_ja = tmp_path / "custom-ja-en"
    monkeypatch.setattr(settings, "opus_mt_model_root", model_root)
    monkeypatch.setattr(settings, "opus_mt_ja_en_model_path", custom_ja)
    monkeypatch.setattr(settings, "opus_mt_ko_en_model_path", None)

    assert provider._model_path_for("ja", "en") == custom_ja
    assert provider._model_path_for("ko", "en") == model_root / "ko-en"


def test_opus_mt_language_aliases() -> None:
    assert _normalize_opus_source_language("ja") == "ja"
    assert _normalize_opus_source_language("jpn") == "ja"
    assert _normalize_opus_source_language("jp") == "ja"
    assert _normalize_opus_source_language("japanese") == "ja"
    assert _normalize_opus_source_language("ko") == "ko"
    assert _normalize_opus_source_language("kor") == "ko"
    assert _normalize_opus_source_language("kr") == "ko"
    assert _normalize_opus_source_language("korean") == "ko"
    assert _normalize_opus_target_language("en") == "en"
    assert _normalize_opus_target_language("eng") == "en"
    assert _normalize_opus_target_language("english") == "en"


@pytest.mark.asyncio
async def test_opus_mt_preserves_order_handles_empty_and_auto_language(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeSentencePiece:
        def encode(self, text: str, out_type: type[str] = str) -> list[str]:
            return [text]

        def decode(self, tokens: list[str]) -> str:
            return " ".join(tokens)

    class FakeResult:
        def __init__(self, tokens: list[str]) -> None:
            self.hypotheses = [tokens]

    class FakeTranslator:
        def __init__(self, source_language: str) -> None:
            self.source_language = source_language

        def translate_batch(
            self,
            tokenized: list[list[str]],
            beam_size: int,
        ) -> list[FakeResult]:
            return [
                FakeResult([self.source_language, "en", *tokens])
                for tokens in tokenized
            ]

    provider = OpusMTTranslationProvider()

    def fake_get_model(source_language: str, target_language: str) -> _OpusMTModelBundle:
        assert target_language == "en"
        sentencepiece = FakeSentencePiece()
        return _OpusMTModelBundle(
            translator=FakeTranslator(source_language),
            source_sp=sentencepiece,
            target_sp=sentencepiece,
        )

    monkeypatch.setattr(provider, "_get_model", fake_get_model)
    monkeypatch.setattr(settings, "opus_mt_default_source_language", "kor")
    monkeypatch.setattr(settings, "opus_mt_max_batch_size", 1)
    monkeypatch.setattr(settings, "opus_mt_beam_size", 1)

    results = await provider.translate_many(
        ["こんにちは", "", "안녕하세요", "漢字"],
        source_language="auto",
        target_language="en",
    )

    assert [result.source_text for result in results] == ["こんにちは", "", "안녕하세요", "漢字"]
    assert [result.translated_text for result in results] == [
        "ja en こんにちは",
        "",
        "ko en 안녕하세요",
        "ko en 漢字",
    ]
    assert [result.detected_language for result in results] == ["ja", "ko", "ko", "ko"]
    assert [result.confidence for result in results] == [None, None, None, None]


def test_opus_mt_script_detection() -> None:
    assert _infer_opus_source_language("안녕하세요") == "ko"
    assert _infer_opus_source_language("こんにちは") == "ja"
    assert _infer_opus_source_language("カタカナ") == "ja"
    assert _infer_opus_source_language("漢字") is None


def test_opus_mt_encoding_appends_end_of_sentence_token() -> None:
    class FakeSentencePiece:
        def encode(self, text: str, out_type: type[str] = str) -> list[str]:
            return [text]

    assert _encode_sentencepiece(FakeSentencePiece(), "こんにちは") == ["こんにちは", "</s>"]


@pytest.mark.asyncio
async def test_mock_provider_behavior_is_unchanged() -> None:
    ocr_regions = await MockOCRProvider().detect_and_read(_png_bytes(), "auto")
    translation_results = await MockTranslationProvider().translate_many(["hello"], "auto", "en")

    assert ocr_regions[0].text == "Sample detected text"
    assert ocr_regions[0].language is None
    assert ocr_regions[0].region_type == RegionType.SPEECH.value
    assert translation_results[0].translated_text == "[en] hello"
    assert translation_results[0].detected_language is None
    assert translation_results[0].confidence == 0.99
