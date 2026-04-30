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


@pytest.mark.asyncio
async def test_render_page_uses_region_style_colors() -> None:
    image = Image.new("RGB", (240, 160), "white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")

    engine = PillowRenderEngine()
    output = await engine.render_page(
        buffer.getvalue(),
        [
            RenderRegion(
                bounding_box={"x": 20, "y": 20, "width": 170, "height": 90},
                original_text=None,
                translated_text="Color",
                render_style={
                    "backgroundColor": "#00ff00",
                    "textColor": "#ff0000",
                    "fontSize": 36,
                    "padding": 2,
                },
            )
        ],
        ReplacementMode.REPLACE.value,
    )

    rendered = Image.open(io.BytesIO(output)).convert("RGB")
    assert rendered.getpixel((26, 26)) == (0, 255, 0)
    red_text_pixels = [
        pixel
        for x in range(20, 190)
        for y in range(20, 110)
        if (pixel := rendered.getpixel((x, y)))[0] > 180 and pixel[1] < 100 and pixel[2] < 100
    ]
    assert red_text_pixels
