from __future__ import annotations

import io

import pytest
from PIL import Image

from app.core.enums import ReplacementMode
from app.providers.rendering import (
    DEFAULT_FILL_OPACITY,
    PillowRenderEngine,
    RenderRegion,
    _bbox_tuple,
    _fit_text,
    _style_color,
    _style_float,
    _style_int,
    _style_opacity,
    _wrap_text,
    get_render_engine,
)


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
                    "fillOpacity": 1,
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


@pytest.mark.asyncio
async def test_render_page_applies_region_fill_opacity() -> None:
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
                translated_text="Opacity",
                render_style={
                    "backgroundColor": "#000000",
                    "fillOpacity": 0.5,
                    "fontSize": 36,
                    "padding": 2,
                },
            )
        ],
        ReplacementMode.REPLACE.value,
    )

    rendered = Image.open(io.BytesIO(output)).convert("RGB")
    assert all(120 <= channel <= 135 for channel in rendered.getpixel((40, 30)))


@pytest.mark.asyncio
async def test_render_page_defaults_region_fill_opacity() -> None:
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
                translated_text="Default",
                render_style={
                    "backgroundColor": "#000000",
                    "fontSize": 36,
                    "padding": 2,
                },
            )
        ],
        ReplacementMode.REPLACE.value,
    )

    rendered = Image.open(io.BytesIO(output)).convert("RGB")
    assert all(180 <= channel <= 190 for channel in rendered.getpixel((40, 30)))


@pytest.mark.asyncio
async def test_clean_page_whites_out_regions_and_engine_factory() -> None:
    image = Image.new("RGB", (160, 120), "black")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")

    engine = get_render_engine()
    assert isinstance(engine, PillowRenderEngine)
    output = await engine.clean_page(
        buffer.getvalue(),
        [
            RenderRegion(
                bounding_box={"x": 20, "y": 20, "width": 80, "height": 50},
                original_text="source",
                translated_text="target",
            )
        ],
    )

    cleaned = Image.open(io.BytesIO(output)).convert("RGB")
    assert cleaned.getpixel((40, 40)) == (255, 255, 255)
    assert cleaned.getpixel((5, 5)) == (0, 0, 0)


@pytest.mark.asyncio
async def test_render_page_covers_overlay_bilingual_side_panel_and_subtitles() -> None:
    image = Image.new("RGB", (320, 220), "white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    data = buffer.getvalue()
    region = RenderRegion(
        bounding_box={"x": 20, "y": 30, "width": 180, "height": 70},
        original_text="原文",
        translated_text="Translated line",
        render_style={
            "fillColor": [10, 20, 30],
            "outlineColor": "not-a-color",
            "text_color": "#ff0000",
            "fillOpacity": "0.25",
            "fontSize": "18",
        },
    )

    engine = PillowRenderEngine()
    overlay = Image.open(io.BytesIO(await engine.render_page(data, [region], ReplacementMode.OVERLAY.value)))
    bilingual = Image.open(io.BytesIO(await engine.render_page(data, [region], ReplacementMode.BILINGUAL.value)))
    side_panel = Image.open(io.BytesIO(await engine.render_page(data, [region], ReplacementMode.SIDE_PANEL.value)))
    subtitles = Image.open(io.BytesIO(await engine.render_page(data, [region], ReplacementMode.SUBTITLE.value)))
    empty_subtitles = Image.open(
        io.BytesIO(
            await engine.render_page(
                data,
                [RenderRegion(region.bounding_box, "source", "")],
                ReplacementMode.SUBTITLE.value,
            )
        )
    )

    assert overlay.size == (320, 220)
    assert bilingual.size == (320, 220)
    assert side_panel.width > 320
    assert subtitles.getpixel((10, subtitles.height - 10)) == (255, 255, 255)
    assert empty_subtitles.size == (320, 220)


def test_rendering_helper_edge_cases() -> None:
    image = Image.new("RGB", (180, 120), "white")
    from PIL import ImageDraw

    draw = ImageDraw.Draw(image)
    wrapped, font = _fit_text(draw, "A very long translated sentence that must wrap", 40, 20, 200)

    assert _bbox_tuple({"x": "1", "y": 2, "width": 3, "height": 4}) == (1, 2, 4, 6)
    assert _wrap_text("first\nsecond", 6) == "first\nsecond"
    assert wrapped
    assert font is not None
    assert _style_color({"fill": [300, -2, "bad"], "backgroundColor": "invalid"}, ("fill",), "white") == (255, 255, 255)
    assert _style_color({"fill": (1, 2, 3)}, ("fill",), "white") == (1, 2, 3)
    assert _style_int({"fontSize": 12.8}, "fontSize") == 12
    assert _style_int({"fontSize": "bad"}, "fontSize", 9) == 9
    assert _style_float({"fillOpacity": True}, "fillOpacity", 0.4) == 0.4
    assert _style_float({"fillOpacity": "bad"}, "fillOpacity", 0.4) == 0.4
    assert _style_opacity({"fillOpacity": float("nan")}, "fillOpacity") == DEFAULT_FILL_OPACITY
    assert _style_opacity({"fillOpacity": 2}, "fillOpacity") == 1.0
    assert _style_opacity({"fillOpacity": -1}, "fillOpacity") == 0.0
