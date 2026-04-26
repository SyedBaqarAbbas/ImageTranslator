from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Image Translator API"
    environment: str = "local"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"
    public_base_url: str = "http://localhost:8000"

    database_url: str = "sqlite+aiosqlite:///./image_translator.db"
    auto_create_tables: bool = False

    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    celery_task_always_eager: bool = False

    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 60 * 24 * 7
    jwt_algorithm: str = "HS256"

    storage_backend: str = "local"
    local_storage_path: Path = Path("./data/storage")
    s3_endpoint_url: str | None = None
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_bucket: str = "image-translator"
    s3_region: str = "us-east-1"

    max_upload_mb: int = 100
    max_project_pages: int = 300
    allowed_image_types: list[str] = Field(
        default_factory=lambda: ["image/png", "image/jpeg", "image/webp"]
    )
    allowed_archive_types: list[str] = Field(
        default_factory=lambda: ["application/zip", "application/x-zip-compressed"]
    )

    ocr_provider: str = "mock"
    translation_provider: str = "mock"
    render_engine: str = "pillow"
    openai_api_key: str | None = None
    deepl_api_key: str | None = None
    google_application_credentials: str | None = None

    log_level: str = "INFO"

    @field_validator("allowed_image_types", "allowed_archive_types", mode="before")
    @classmethod
    def split_csv(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()]
        return value

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

