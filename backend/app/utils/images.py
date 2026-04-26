from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass

from PIL import Image, ImageOps

from app.core.config import settings
from app.core.errors import AppError
from app.utils.files import content_type_for_filename, safe_filename


@dataclass(frozen=True)
class ExtractedImage:
    filename: str
    content_type: str
    data: bytes


def image_dimensions(data: bytes) -> tuple[int, int]:
    with Image.open(io.BytesIO(data)) as image:
        return image.size


def normalize_image_bytes(data: bytes, format: str = "PNG") -> bytes:
    with Image.open(io.BytesIO(data)) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        output = io.BytesIO()
        image.save(output, format=format)
        return output.getvalue()


def validate_image_upload(filename: str, content_type: str, data: bytes) -> tuple[int, int]:
    if content_type not in settings.allowed_image_types:
        guessed = content_type_for_filename(filename)
        if guessed not in settings.allowed_image_types:
            raise AppError("invalid_file_type", f"Unsupported image type: {content_type}")
    if len(data) > settings.max_upload_bytes:
        raise AppError("file_too_large", f"File exceeds {settings.max_upload_mb} MB limit.")
    try:
        return image_dimensions(data)
    except Exception as exc:
        raise AppError("invalid_image", "Uploaded file is not a readable image.") from exc


def extract_images_from_zip(data: bytes) -> list[ExtractedImage]:
    if len(data) > settings.max_upload_bytes:
        raise AppError("file_too_large", f"Archive exceeds {settings.max_upload_mb} MB limit.")

    images: list[ExtractedImage] = []
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for info in sorted(archive.infolist(), key=lambda item: item.filename):
            if info.is_dir() or info.filename.startswith("__MACOSX/"):
                continue
            filename = safe_filename(info.filename)
            content_type = content_type_for_filename(filename)
            if content_type not in settings.allowed_image_types:
                continue
            payload = archive.read(info)
            validate_image_upload(filename, content_type, payload)
            images.append(ExtractedImage(filename=filename, content_type=content_type, data=payload))

    if not images:
        raise AppError("archive_empty", "ZIP archive did not contain supported image files.")
    return images

