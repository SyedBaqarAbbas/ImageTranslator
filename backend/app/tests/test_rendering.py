from __future__ import annotations

import io

import pytest
from PIL import Image

from app.core.enums import ReplacementMode
from app.providers.rendering import PillowRenderEngine, RenderRegion


@pytest.mark.asyncio
async def test_render_page_outputs_png_bytes() -> None:
    image = Image.new("RGB", (400, 300), "white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")

    engine = PillowRenderEngine()
    output = await engine.render_page(
        buffer.getvalue(),
        [
            RenderRegion(
                bounding_box={"x": 60, "y": 40, "width": 240, "height": 80},
                original_text="안녕하세요",
                translated_text="Hello",
            )
        ],
        ReplacementMode.REPLACE.value,
    )

    rendered = Image.open(io.BytesIO(output))
    assert rendered.size == (400, 300)

