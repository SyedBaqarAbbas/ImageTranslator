from __future__ import annotations

from fastapi import APIRouter

from app.core.config import settings
from app.schemas.runtime import RuntimeLanguageRead

router = APIRouter(prefix="/runtime", tags=["runtime"])

LANGUAGE_ALIASES = {
    "japanese": "ja",
    "jpn": "ja",
    "jp": "ja",
    "korean": "ko",
    "kor": "ko",
    "kr": "ko",
    "english": "en",
    "eng": "en",
}


def _normalize_language(value: str | None, fallback: str) -> str:
    raw = (value or fallback).strip().lower() or fallback
    return LANGUAGE_ALIASES.get(raw, raw)


@router.get("/language", response_model=RuntimeLanguageRead)
async def runtime_language() -> RuntimeLanguageRead:
    source_language = "auto"
    target_language = "en"

    if settings.translation_provider == "opus_mt":
        source_language = _normalize_language(settings.opus_mt_default_source_language, "ko")

    return RuntimeLanguageRead(
        source_language=source_language,
        target_language=target_language,
        provider=settings.translation_provider,
        locked=True,
        lock_message="Ask a system administrator to change the language.",
    )
