from __future__ import annotations

import io
import zipfile

from PIL import Image

from app.utils.images import extract_images_from_zip, image_dimensions


def _png_bytes() -> bytes:
    image = Image.new("RGB", (32, 24), "white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_image_dimensions() -> None:
    assert image_dimensions(_png_bytes()) == (32, 24)


def test_extract_images_from_zip() -> None:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("page-001.png", _png_bytes())
        archive.writestr("notes.txt", "ignored")

    images = extract_images_from_zip(buffer.getvalue())

    assert len(images) == 1
    assert images[0].filename == "page-001.png"

