from __future__ import annotations

import pytest

from app.core.config import Settings
from app.core.config import settings as runtime_settings
from app.main import _cors_allow_credentials, _cors_allowed_origins


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


@pytest.mark.parametrize("environment", ["local", "staging", "production", "preview", "qa"])
def test_cors_allows_configured_origins_in_every_environment(
    monkeypatch, environment: str
) -> None:
    monkeypatch.setattr(runtime_settings, "environment", environment)
    monkeypatch.setattr(runtime_settings, "cors_allowed_origins", ["https://app.example.com"])

    assert _cors_allowed_origins() == ["https://app.example.com"]
    assert _cors_allow_credentials(_cors_allowed_origins()) is True


@pytest.mark.parametrize("environment", ["staging", "production", "preview", "qa"])
def test_cors_fails_closed_without_configured_origins_outside_local(
    monkeypatch, environment: str
) -> None:
    monkeypatch.setattr(runtime_settings, "environment", environment)
    monkeypatch.setattr(runtime_settings, "cors_allowed_origins", [])

    assert _cors_allowed_origins() == []
    assert _cors_allow_credentials(_cors_allowed_origins()) is True


def test_cors_keeps_local_wildcard_without_configured_origins(monkeypatch) -> None:
    monkeypatch.setattr(runtime_settings, "environment", "local")
    monkeypatch.setattr(runtime_settings, "cors_allowed_origins", [])

    assert _cors_allowed_origins() == ["*"]
    assert _cors_allow_credentials(_cors_allowed_origins()) is True


def test_cors_disables_credentials_for_non_local_wildcard(monkeypatch) -> None:
    monkeypatch.setattr(runtime_settings, "environment", "production")

    assert _cors_allow_credentials(["*"]) is False
