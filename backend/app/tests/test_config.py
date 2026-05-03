from __future__ import annotations

from app.core.config import Settings


def test_settings_accept_csv_mime_type_env(monkeypatch) -> None:
    monkeypatch.setenv("ALLOWED_IMAGE_TYPES", "image/png,image/jpeg,image/webp")
    monkeypatch.setenv("ALLOWED_ARCHIVE_TYPES", "application/zip,application/x-zip-compressed")

    settings = Settings(_env_file=None)

    assert settings.allowed_image_types == ["image/png", "image/jpeg", "image/webp"]
    assert settings.allowed_archive_types == [
        "application/zip",
        "application/x-zip-compressed",
    ]


def test_settings_accept_json_mime_type_env(monkeypatch) -> None:
    monkeypatch.setenv("ALLOWED_IMAGE_TYPES", '["image/png","image/jpeg","image/webp"]')
    monkeypatch.setenv(
        "ALLOWED_ARCHIVE_TYPES",
        '["application/zip","application/x-zip-compressed"]',
    )

    settings = Settings(_env_file=None)

    assert settings.allowed_image_types == ["image/png", "image/jpeg", "image/webp"]
    assert settings.allowed_archive_types == [
        "application/zip",
        "application/x-zip-compressed",
    ]
