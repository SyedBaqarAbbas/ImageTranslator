from __future__ import annotations

from pydantic import BaseModel


class RuntimeLanguageRead(BaseModel):
    source_language: str
    target_language: str
    provider: str
    locked: bool
    lock_message: str
