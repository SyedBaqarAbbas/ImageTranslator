from __future__ import annotations

from app.core.config import Settings
from app.core.config import settings as runtime_settings
from app.main import _cors_allowed_origins


def test_settings_accept_csv_mime_type_env(monkeypatch) -> None:
    monkeypatch.setenv("ALLOWED_IMAGE_TYPES", "image/png,image/jpeg,image/webp")
    monkeypatch.setenv("ALLOWED_ARCHIVE_TYPES", "application/zip,application/x-zip-compressed")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://app.example.com,http://localhost:5173")

    settings = Settings(_env_file=None)

    assert settings.allowed_image_types == ["image/png", "image/jpeg", "image/webp"]
    assert settings.allowed_archive_types == [
        "application/zip",
        "application/x-zip-compressed",
    ]
    assert settings.cors_allowed_origins == [
        "https://app.example.com",
        "http://localhost:5173",
    ]


def test_settings_accept_json_mime_type_env(monkeypatch) -> None:
    monkeypatch.setenv("ALLOWED_IMAGE_TYPES", '["image/png","image/jpeg","image/webp"]')
    monkeypatch.setenv(
        "ALLOWED_ARCHIVE_TYPES",
        '["application/zip","application/x-zip-compressed"]',
    )
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", '["https://app.example.com","http://localhost:5173"]')

    settings = Settings(_env_file=None)

    assert settings.allowed_image_types == ["image/png", "image/jpeg", "image/webp"]
    assert settings.allowed_archive_types == [
        "application/zip",
        "application/x-zip-compressed",
    ]
    assert settings.cors_allowed_origins == [
        "https://app.example.com",
        "http://localhost:5173",
    ]


def test_cors_allows_configured_origins_outside_local(monkeypatch) -> None:
    monkeypatch.setattr(runtime_settings, "environment", "production")
    monkeypatch.setattr(runtime_settings, "cors_allowed_origins", ["https://app.example.com"])

    assert _cors_allowed_origins() == ["https://app.example.com"]


def test_cors_defaults_to_wildcard_outside_local(monkeypatch) -> None:
    monkeypatch.setattr(runtime_settings, "environment", "production")
    monkeypatch.setattr(runtime_settings, "cors_allowed_origins", [])

    assert _cors_allowed_origins() == ["*"]


def test_cors_keeps_local_wildcard_without_configured_origins(monkeypatch) -> None:
    monkeypatch.setattr(runtime_settings, "environment", "local")
    monkeypatch.setattr(runtime_settings, "cors_allowed_origins", [])

    assert _cors_allowed_origins() == ["*"]
