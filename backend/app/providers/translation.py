from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

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
        raise NotImplementedError("Wire this provider to DeepL's API with provider-specific mapping.")


def get_translation_provider() -> TranslationProvider:
    if settings.translation_provider == "openai":
        return OpenAITranslationProvider()
    if settings.translation_provider == "deepl":
        return DeepLTranslationProvider()
    return MockTranslationProvider()

