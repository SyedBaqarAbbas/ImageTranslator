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
    _font,
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
async def test_render_page_honors_editor_style_on_original_pixels() -> None:
    image = Image.new("RGB", (400, 300), "#24364f")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")

    engine = PillowRenderEngine()
    output = await engine.render_page(
        buffer.getvalue(),
        [
            RenderRegion(
                bounding_box={"x": 124, "y": 24, "width": 152, "height": 70},
                original_text=None,
                translated_text="A",
                render_style={
                    "backgroundColor": "#ffffff",
                    "fillOpacity": 0.5,
                    "textColor": "#000000",
                    "fontSize": 40,
                    "padding": 6,
                },
            )
        ],
        ReplacementMode.REPLACE.value,
    )

    rendered = Image.open(io.BytesIO(output)).convert("RGB")
    blended_fill = rendered.getpixel((144, 36))
    assert 140 <= blended_fill[0] <= 152
    assert 148 <= blended_fill[1] <= 160
    assert 160 <= blended_fill[2] <= 175
    assert rendered.getpixel((80, 80)) == (36, 54, 79)

    black_text_pixels = [
        (x, y)
        for x in range(124, 276)
        for y in range(24, 94)
        if (pixel := rendered.getpixel((x, y)))[0] < 30 and pixel[1] < 30 and pixel[2] < 30
    ]
    assert black_text_pixels
    assert max(x for x, _ in black_text_pixels) - min(x for x, _ in black_text_pixels) >= 18
    assert max(y for _, y in black_text_pixels) - min(y for _, y in black_text_pixels) >= 24


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
async def test_translucent_fill_composites_only_region_bounds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    image_size = (2000, 3000)
    image = Image.new("RGB", image_size, "white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")

    rgba_allocations: list[tuple[int, int]] = []
    composite_sizes: list[tuple[int, int]] = []
    real_image_new = Image.new
    real_alpha_composite = Image.alpha_composite

    def tracking_image_new(
        mode: str,
        size: tuple[int, int],
        color: object = 0,
    ) -> Image.Image:
        if mode == "RGBA":
            rgba_allocations.append(size)
        return real_image_new(mode, size, color)

    def tracking_alpha_composite(image_1: Image.Image, image_2: Image.Image) -> Image.Image:
        composite_sizes.append(image_1.size)
        return real_alpha_composite(image_1, image_2)

    monkeypatch.setattr(Image, "new", tracking_image_new)
    monkeypatch.setattr(Image, "alpha_composite", tracking_alpha_composite)

    engine = PillowRenderEngine()
    output = await engine.render_page(
        buffer.getvalue(),
        [
            RenderRegion(
                bounding_box={"x": 100, "y": 120, "width": 100, "height": 80},
                original_text=None,
                translated_text=" ",
                render_style={
                    "backgroundColor": "#000000",
                    "fillOpacity": 0.5,
                    "fontSize": 12,
                    "padding": 2,
                },
            )
        ],
        ReplacementMode.REPLACE.value,
    )

    assert image_size not in rgba_allocations
    assert image_size not in composite_sizes
    assert (101, 81) in rgba_allocations
    assert all(width <= 101 and height <= 81 for width, height in rgba_allocations)
    assert composite_sizes == [(101, 81), (96, 76)]

    rendered = Image.open(io.BytesIO(output)).convert("RGB")
    assert all(120 <= channel <= 135 for channel in rendered.getpixel((120, 140)))
    assert all(120 <= channel <= 135 for channel in rendered.getpixel((200, 160)))
    assert all(120 <= channel <= 135 for channel in rendered.getpixel((150, 200)))
    assert rendered.getpixel((90, 110)) == (255, 255, 255)
    assert rendered.getpixel((201, 160)) == (255, 255, 255)
    assert rendered.getpixel((150, 201)) == (255, 255, 255)


@pytest.mark.asyncio
async def test_translucent_fill_clips_partially_out_of_bounds_region() -> None:
    image = Image.new("RGB", (120, 100), "white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")

    engine = PillowRenderEngine()
    output = await engine.render_page(
        buffer.getvalue(),
        [
            RenderRegion(
                bounding_box={"x": -10, "y": -8, "width": 50, "height": 40},
                original_text=None,
                translated_text=" ",
                render_style={
                    "background_color": "#000000",
                    "fillOpacity": 0.5,
                    "fontSize": 10,
                    "padding": 2,
                },
            )
        ],
        ReplacementMode.REPLACE.value,
    )

    rendered = Image.open(io.BytesIO(output)).convert("RGB")
    assert all(120 <= channel <= 135 for channel in rendered.getpixel((20, 20)))
    assert all(120 <= channel <= 135 for channel in rendered.getpixel((40, 20)))
    assert all(120 <= channel <= 135 for channel in rendered.getpixel((20, 32)))
    assert rendered.getpixel((60, 50)) == (255, 255, 255)


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
    overlay = Image.open(
        io.BytesIO(await engine.render_page(data, [region], ReplacementMode.OVERLAY.value))
    )
    bilingual = Image.open(
        io.BytesIO(await engine.render_page(data, [region], ReplacementMode.BILINGUAL.value))
    )
    side_panel = Image.open(
        io.BytesIO(await engine.render_page(data, [region], ReplacementMode.SIDE_PANEL.value))
    )
    subtitles = Image.open(
        io.BytesIO(await engine.render_page(data, [region], ReplacementMode.SUBTITLE.value))
    )
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
    wrapped_hyphenated, hyphen_font = _fit_text(draw, "IMA-61", 140, 70, 40)

    assert _bbox_tuple({"x": "1", "y": 2, "width": 3, "height": 4}) == (1, 2, 4, 6)
    assert _wrap_text("first\nsecond", 6) == "first\nsecond"
    assert wrapped
    assert font is not None
    assert wrapped_hyphenated == "IMA-\n61"
    assert getattr(hyphen_font, "size", None) == 40
    assert _style_color(
        {"fill": [300, -2, "bad"], "backgroundColor": "invalid"},
        ("fill",),
        "white",
    ) == (255, 255, 255)
    assert _style_color({"fill": (1, 2, 3)}, ("fill",), "white") == (1, 2, 3)
    assert _style_int({"fontSize": 12.8}, "fontSize") == 12
    assert _style_int({"fontSize": "bad"}, "fontSize", 9) == 9
    assert _style_float({"fillOpacity": True}, "fillOpacity", 0.4) == 0.4
    assert _style_float({"fillOpacity": "bad"}, "fillOpacity", 0.4) == 0.4
    assert _style_opacity({"fillOpacity": float("nan")}, "fillOpacity") == DEFAULT_FILL_OPACITY
    assert _style_opacity({"fillOpacity": 2}, "fillOpacity") == 1.0
    assert _style_opacity({"fillOpacity": -1}, "fillOpacity") == 0.0


def test_font_loader_preserves_requested_editor_text_size() -> None:
    font = _font(40)
    text_bbox = font.getbbox("Sample")

    assert getattr(font, "size", None) == 40
    assert text_bbox[3] - text_bbox[1] >= 30
