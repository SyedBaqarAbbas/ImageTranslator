from __future__ import annotations

import io
from pathlib import Path

import pytest
from PIL import Image

from app.core.config import settings
from app.core.enums import RegionType
from app.providers.ocr import (
    EasyOCRProvider,
    MockOCRProvider,
    TesseractOCRProvider,
    _confidence_data_value,
    _contains_expected_script,
    _data_value,
    _int_data_value,
    _normalize_tesseract_language,
    _ocr_text_score,
    _prepare_tesseract_image,
    _regions_from_tesseract_data,
    _should_retry_without_preprocessing,
    _tesseract_config,
    _tesseract_row_count,
    _tesseract_scale_factor,
    get_ocr_provider,
)
from app.providers.translation import (
    DeepLTranslationProvider,
    MockTranslationProvider,
    OpenAITranslationProvider,
    OpusMTTranslationProvider,
    _decode_sentencepiece,
    _encode_sentencepiece,
    _extract_first_hypothesis,
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


def test_easyocr_provider_selection_and_reader_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeEasyOCR:
        reader_calls: list[tuple[str, ...]] = []

        class Reader:
            def __init__(self, languages: list[str], gpu: bool) -> None:
                FakeEasyOCR.reader_calls.append(tuple(languages))
                self.languages = languages
                self.gpu = gpu

            def readtext(self, _array: object) -> list[tuple[list[tuple[int, int]], str, float]]:
                return [
                    (
                        [(1, 2), (11, 2), (11, 22), (1, 22)],
                        "테스트",
                        0.91,
                    )
                ]

    monkeypatch.setitem(__import__("sys").modules, "easyocr", FakeEasyOCR)
    monkeypatch.setattr(settings, "ocr_provider", "easyocr")

    provider = get_ocr_provider()
    assert isinstance(provider, EasyOCRProvider)
    assert provider._reader_for("auto") is provider._reader_for("auto")
    assert FakeEasyOCR.reader_calls == [("en",)]


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


def test_tesseract_helpers_cover_preprocessing_and_data_edge_cases(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "tesseract_upscale_min_dimension", 500)
    monkeypatch.setattr(settings, "tesseract_upscale_max_factor", 3.0)
    monkeypatch.setattr(settings, "tesseract_preprocess", True)
    monkeypatch.setattr(settings, "tesseract_threshold", 0)
    monkeypatch.setattr(settings, "tesseract_oem", 1)
    monkeypatch.setattr(settings, "tesseract_psm", 6)
    monkeypatch.setattr(settings, "tesseract_data_path", Path("/tmp/tessdata"))

    prepared, scale = _prepare_tesseract_image(_png_bytes())
    assert prepared.mode == "L"
    assert scale > 1
    assert _tesseract_scale_factor((500, 200)) == 1.0
    assert '--tessdata-dir "/tmp/tessdata"' in _tesseract_config()

    data = {
        "text": ["A", "", "B"],
        "left": ["bad", 50, 80],
        "top": [10],
        "width": [20, 20, 30],
        "height": [10, "bad", 14],
        "conf": ["99", "-1", "bad"],
        "block_num": [1, 1, 1],
        "par_num": [1, 1, 1],
        "line_num": [1, 1, 1],
    }
    assert _tesseract_row_count(data) == 3
    assert _data_value(data, "missing", 2, "fallback") == "fallback"
    assert _int_data_value(data, "left", 0) == 0
    assert _confidence_data_value(data, "conf", 1) is None
    assert _confidence_data_value(data, "conf", 2) is None

    regions = _regions_from_tesseract_data(data, "eng", scale=2)
    assert regions[0].bounding_box == {"x": 0, "y": 0, "width": 55, "height": 10}
    assert regions[0].confidence == pytest.approx(0.99)
    assert _contains_expected_script("plain latin", "eng")
    assert _contains_expected_script("漢字", "jpn")
    assert not _contains_expected_script("plain latin", "jpn")
    assert _should_retry_without_preprocessing([], "jpn")
    assert _should_retry_without_preprocessing(regions, "jpn")
    assert _ocr_text_score([], "jpn") == 0.0


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


def test_translation_provider_selection_and_not_implemented(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "translation_provider", "openai")
    assert isinstance(get_translation_provider(), OpenAITranslationProvider)
    monkeypatch.setattr(settings, "translation_provider", "deepl")
    assert isinstance(get_translation_provider(), DeepLTranslationProvider)


@pytest.mark.asyncio
async def test_stub_translation_providers_raise_actionable_errors() -> None:
    with pytest.raises(NotImplementedError, match="OpenAI Responses API"):
        await OpenAITranslationProvider().translate_many(["hi"], "ja", "en")
    with pytest.raises(NotImplementedError, match="DeepL"):
        await DeepLTranslationProvider().translate_many(["hi"], "ja", "en")


def test_opus_mt_invalid_language_and_missing_model_contracts(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    provider = OpusMTTranslationProvider()
    monkeypatch.setattr(settings, "opus_mt_default_source_language", "ja")
    monkeypatch.setattr(settings, "opus_mt_model_root", tmp_path / "missing-root")

    with pytest.raises(ValueError, match="Unsupported OPUS-MT source language"):
        _normalize_opus_source_language("fr")
    with pytest.raises(ValueError, match="Unsupported OPUS-MT target language"):
        _normalize_opus_target_language("fr")
    with pytest.raises(ValueError, match="Unsupported OPUS-MT target language"):
        provider._model_path_for("ja", "fr")
    with pytest.raises(ValueError, match="Unsupported OPUS-MT source language"):
        provider._model_path_for("zh", "en")
    with pytest.raises(FileNotFoundError, match="model directory not found"):
        provider._load_model_bundle(tmp_path / "does-not-exist")

    model_path = tmp_path / "ja-en"
    model_path.mkdir()
    with pytest.raises(FileNotFoundError, match="source SentencePiece"):
        provider._load_model_bundle(model_path)
    (model_path / "source.spm").write_bytes(b"source")
    with pytest.raises(FileNotFoundError, match="target SentencePiece"):
        provider._load_model_bundle(model_path)


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


def test_opus_mt_sentencepiece_legacy_and_hypothesis_shapes() -> None:
    class LegacySentencePiece:
        def EncodeAsPieces(self, text: str) -> list[str]:
            return [text, "</s>"]

        def DecodePieces(self, tokens: list[str]) -> str:
            return "|".join(tokens)

    assert _encode_sentencepiece(LegacySentencePiece(), "hello") == ["hello", "</s>"]
    assert _decode_sentencepiece(LegacySentencePiece(), ["<s>", "hello", "</s>"]) == "hello"
    assert _extract_first_hypothesis({"hypotheses": [["a", "b"]]}) == ["a", "b"]
    assert _extract_first_hypothesis([[1, "b"]]) == ["1", "b"]
    with pytest.raises(RuntimeError, match="translation hypothesis"):
        _extract_first_hypothesis({"hypotheses": []})


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
