from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any, ClassVar, Protocol, cast

from app.core.config import settings


@dataclass(frozen=True)
class TranslationResult:
    source_text: str
    translated_text: str
    detected_language: str | None
    confidence: float | None = None


class TranslationProvider(Protocol):
    async def translate_many(
        self,
        texts: list[str],
        source_language: str,
        target_language: str,
        tone: str = "natural",
        context: dict | None = None,
    ) -> list[TranslationResult]:
        ...


class MockTranslationProvider:
    async def translate_many(
        self,
        texts: list[str],
        source_language: str,
        target_language: str,
        tone: str = "natural",
        context: dict | None = None,
    ) -> list[TranslationResult]:
        return [
            TranslationResult(
                source_text=text,
                translated_text=f"[{target_language}] {text}",
                detected_language=None if source_language == "auto" else source_language,
                confidence=0.99,
            )
            for text in texts
        ]


class OpenAITranslationProvider:
    async def translate_many(
        self,
        texts: list[str],
        source_language: str,
        target_language: str,
        tone: str = "natural",
        context: dict | None = None,
    ) -> list[TranslationResult]:
        raise NotImplementedError(
            "Wire this provider to the OpenAI Responses API using app.services.translation_service."
        )


class DeepLTranslationProvider:
    async def translate_many(
        self,
        texts: list[str],
        source_language: str,
        target_language: str,
        tone: str = "natural",
        context: dict | None = None,
    ) -> list[TranslationResult]:
        raise NotImplementedError(
            "Wire this provider to DeepL's API with provider-specific mapping."
        )


_OPUS_SOURCE_LANGUAGE_ALIASES = {
    "ja": "ja",
    "jpn": "ja",
    "jp": "ja",
    "japanese": "ja",
    "ko": "ko",
    "kor": "ko",
    "kr": "ko",
    "korean": "ko",
}

_OPUS_TARGET_LANGUAGE_ALIASES = {
    "en": "en",
    "eng": "en",
    "english": "en",
}

_SPECIAL_TOKENS = {"<s>", "</s>", "<pad>"}


@dataclass(frozen=True)
class _OpusMTModelBundle:
    translator: Any
    source_sp: Any
    target_sp: Any


def _normalize_opus_source_language(source_language: str | None) -> str:
    raw = (source_language or "").strip().lower()
    if raw == "auto":
        return "auto"
    if not raw:
        raw = settings.opus_mt_default_source_language.strip().lower()
    normalized = _OPUS_SOURCE_LANGUAGE_ALIASES.get(raw)
    if normalized is None:
        raise ValueError(f"Unsupported OPUS-MT source language: {source_language}")
    return normalized


def _normalize_opus_target_language(target_language: str | None) -> str:
    raw = (target_language or "").strip().lower()
    normalized = _OPUS_TARGET_LANGUAGE_ALIASES.get(raw)
    if normalized is None:
        raise ValueError(f"Unsupported OPUS-MT target language: {target_language}")
    return normalized


def _infer_opus_source_language(text: str) -> str | None:
    hangul_count = 0
    japanese_count = 0
    for character in text:
        codepoint = ord(character)
        if (
            0xAC00 <= codepoint <= 0xD7AF
            or 0x1100 <= codepoint <= 0x11FF
            or 0x3130 <= codepoint <= 0x318F
        ):
            hangul_count += 1
        elif 0x3040 <= codepoint <= 0x30FF or 0x31F0 <= codepoint <= 0x31FF:
            japanese_count += 1

    if hangul_count:
        return "ko"
    if japanese_count:
        return "ja"
    return None


class OpusMTTranslationProvider:
    _model_cache: ClassVar[dict[tuple[str, ...], _OpusMTModelBundle]] = {}
    _cache_lock: ClassVar[Lock] = Lock()

    async def translate_many(
        self,
        texts: list[str],
        source_language: str,
        target_language: str,
        tone: str = "natural",
        context: dict | None = None,
    ) -> list[TranslationResult]:
        if not texts:
            return []

        target = _normalize_opus_target_language(target_language)
        results: list[TranslationResult | None] = [None] * len(texts)
        grouped_texts: dict[tuple[str, str], list[tuple[int, str]]] = {}

        for index, text in enumerate(texts):
            source = self._resolve_source_language(source_language, text)
            if not text.strip():
                results[index] = TranslationResult(
                    source_text=text,
                    translated_text="",
                    detected_language=source,
                    confidence=None,
                )
                continue
            grouped_texts.setdefault((source, target), []).append((index, text))

        for (source, group_target), indexed_texts in grouped_texts.items():
            source_texts = [text for _, text in indexed_texts]
            translated_texts = await asyncio.to_thread(
                self._translate_batch_sync,
                source,
                group_target,
                source_texts,
            )
            if len(translated_texts) != len(indexed_texts):
                raise RuntimeError("OPUS-MT returned a different number of translations.")
            for (index, source_text), translated_text in zip(
                indexed_texts,
                translated_texts,
                strict=True,
            ):
                results[index] = TranslationResult(
                    source_text=source_text,
                    translated_text=translated_text,
                    detected_language=source,
                    confidence=None,
                )

        return [cast(TranslationResult, result) for result in results]

    def _resolve_source_language(self, source_language: str, text: str) -> str:
        normalized = _normalize_opus_source_language(source_language)
        if normalized != "auto":
            return normalized

        inferred = _infer_opus_source_language(text)
        if inferred:
            return inferred

        fallback = _normalize_opus_source_language(settings.opus_mt_default_source_language)
        return "ja" if fallback == "auto" else fallback

    def _translate_batch_sync(
        self,
        source_language: str,
        target_language: str,
        texts: list[str],
    ) -> list[str]:
        bundle = self._get_model(source_language, target_language)
        translations: list[str] = []
        batch_size = max(1, settings.opus_mt_max_batch_size)
        for start in range(0, len(texts), batch_size):
            batch = texts[start : start + batch_size]
            tokenized = [_encode_sentencepiece(bundle.source_sp, text) for text in batch]
            raw_results = bundle.translator.translate_batch(
                tokenized,
                beam_size=settings.opus_mt_beam_size,
            )
            for raw_result in raw_results:
                hypothesis = _extract_first_hypothesis(raw_result)
                translations.append(_decode_sentencepiece(bundle.target_sp, hypothesis))
        return translations

    def _get_model(self, source_language: str, target_language: str) -> _OpusMTModelBundle:
        model_path = self._model_path_for(source_language, target_language)
        key = (
            source_language,
            target_language,
            str(model_path),
            settings.opus_mt_compute_type,
            str(settings.opus_mt_inter_threads),
            str(settings.opus_mt_intra_threads),
        )
        with self._cache_lock:
            cached = self._model_cache.get(key)
            if cached is not None:
                return cached
            bundle = self._load_model_bundle(model_path)
            self._model_cache[key] = bundle
            return bundle

    def _model_path_for(self, source_language: str, target_language: str) -> Path:
        if target_language != "en":
            raise ValueError(f"Unsupported OPUS-MT target language: {target_language}")
        if source_language == "ja":
            return settings.opus_mt_ja_en_model_path or settings.opus_mt_model_root / "ja-en"
        if source_language == "ko":
            return settings.opus_mt_ko_en_model_path or settings.opus_mt_model_root / "ko-en"
        raise ValueError(f"Unsupported OPUS-MT source language: {source_language}")

    def _load_model_bundle(self, model_path: Path) -> _OpusMTModelBundle:
        if not model_path.exists():
            raise FileNotFoundError(f"OPUS-MT model directory not found: {model_path}")

        source_sp_path = model_path / "source.spm"
        target_sp_path = model_path / "target.spm"
        if not source_sp_path.exists():
            raise FileNotFoundError(
                f"OPUS-MT source SentencePiece model not found: {source_sp_path}"
            )
        if not target_sp_path.exists():
            raise FileNotFoundError(
                f"OPUS-MT target SentencePiece model not found: {target_sp_path}"
            )

        import ctranslate2  # type: ignore[import-not-found]
        import sentencepiece  # type: ignore[import-not-found]

        translator = ctranslate2.Translator(
            str(model_path),
            device="cpu",
            compute_type=settings.opus_mt_compute_type,
            inter_threads=settings.opus_mt_inter_threads,
            intra_threads=settings.opus_mt_intra_threads,
        )
        source_sp = sentencepiece.SentencePieceProcessor()
        target_sp = sentencepiece.SentencePieceProcessor()
        source_sp.load(str(source_sp_path))
        target_sp.load(str(target_sp_path))
        return _OpusMTModelBundle(translator=translator, source_sp=source_sp, target_sp=target_sp)


def _encode_sentencepiece(processor: Any, text: str) -> list[str]:
    if hasattr(processor, "encode"):
        pieces = [str(piece) for piece in processor.encode(text, out_type=str)]
    else:
        pieces = [str(piece) for piece in processor.EncodeAsPieces(text)]
    if not pieces or pieces[-1] != "</s>":
        pieces.append("</s>")
    return pieces


def _decode_sentencepiece(processor: Any, tokens: list[str]) -> str:
    clean_tokens = [token for token in tokens if token not in _SPECIAL_TOKENS]
    if hasattr(processor, "decode"):
        return str(processor.decode(clean_tokens))
    return str(processor.DecodePieces(clean_tokens))


def _extract_first_hypothesis(result: Any) -> list[str]:
    hypotheses = getattr(result, "hypotheses", None)
    if hypotheses:
        return [str(token) for token in hypotheses[0]]
    if isinstance(result, dict) and result.get("hypotheses"):
        return [str(token) for token in result["hypotheses"][0]]
    if isinstance(result, (list, tuple)) and result:
        first = result[0]
        if isinstance(first, (list, tuple)):
            return [str(token) for token in first]
    raise RuntimeError("OPUS-MT result did not include a translation hypothesis.")


def get_translation_provider() -> TranslationProvider:
    if settings.translation_provider == "openai":
        return OpenAITranslationProvider()
    if settings.translation_provider == "deepl":
        return DeepLTranslationProvider()
    if settings.translation_provider == "opus_mt":
        return OpusMTTranslationProvider()
    return MockTranslationProvider()
