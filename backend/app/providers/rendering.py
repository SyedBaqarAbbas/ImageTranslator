from __future__ import annotations

import io
import math
import textwrap
from dataclasses import dataclass
from typing import Protocol

from PIL import Image, ImageDraw, ImageFont

from app.core.enums import ReplacementMode


@dataclass(frozen=True)
class RenderRegion:
    bounding_box: dict
    original_text: str | None
    translated_text: str | None
    render_style: dict | None = None


class RenderEngine(Protocol):
    async def clean_page(self, image_bytes: bytes, regions: list[RenderRegion]) -> bytes:
        ...

    async def render_page(
        self,
        image_bytes: bytes,
        regions: list[RenderRegion],
        replacement_mode: str = ReplacementMode.REPLACE.value,
    ) -> bytes:
        ...


class PillowRenderEngine:
    async def clean_page(self, image_bytes: bytes, regions: list[RenderRegion]) -> bytes:
        with Image.open(io.BytesIO(image_bytes)) as image:
            canvas = image.convert("RGB")
        draw = ImageDraw.Draw(canvas)
        for region in regions:
            bbox = _bbox_tuple(region.bounding_box)
            draw.rounded_rectangle(bbox, radius=8, fill="white")
        output = io.BytesIO()
        canvas.save(output, format="PNG")
        return output.getvalue()

    async def render_page(
        self,
        image_bytes: bytes,
        regions: list[RenderRegion],
        replacement_mode: str = ReplacementMode.REPLACE.value,
    ) -> bytes:
        with Image.open(io.BytesIO(image_bytes)) as image:
            canvas = image.convert("RGB")

        if replacement_mode == ReplacementMode.SIDE_PANEL.value:
            canvas = _add_side_panel(canvas, regions)
        elif replacement_mode == ReplacementMode.SUBTITLE.value:
            canvas = _render_subtitles(canvas, regions)
        else:
            draw = ImageDraw.Draw(canvas)
            for region in regions:
                _render_region(draw, region, replacement_mode)

        output = io.BytesIO()
        canvas.save(output, format="PNG")
        return output.getvalue()


def get_render_engine() -> RenderEngine:
    return PillowRenderEngine()


def _bbox_tuple(bounding_box: dict) -> tuple[int, int, int, int]:
    x = int(bounding_box["x"])
    y = int(bounding_box["y"])
    width = int(bounding_box["width"])
    height = int(bounding_box["height"])
    return x, y, x + width, y + height


def _text_for(region: RenderRegion, replacement_mode: str) -> str:
    translated = region.translated_text or ""
    if replacement_mode == ReplacementMode.BILINGUAL.value:
        original = region.original_text or ""
        return f"{original}\n{translated}" if original else translated
    return translated


def _font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype("DejaVuSans.ttf", size)
    except OSError:
        return ImageFont.load_default()


def _wrap_text(text: str, max_chars: int) -> str:
    lines: list[str] = []
    for paragraph in text.splitlines() or [""]:
        lines.extend(textwrap.wrap(paragraph, width=max(4, max_chars)) or [""])
    return "\n".join(lines)


def _fit_text(draw: ImageDraw.ImageDraw, text: str, width: int, height: int) -> tuple[str, ImageFont.ImageFont]:
    for size in range(min(42, max(12, height // 3)), 8, -1):
        font = _font(size)
        avg_char_width = max(1, int(size * 0.58))
        wrapped = _wrap_text(text, max(4, width // avg_char_width))
        bbox = draw.multiline_textbbox((0, 0), wrapped, font=font, spacing=max(2, size // 6))
        if (bbox[2] - bbox[0]) <= width and (bbox[3] - bbox[1]) <= height:
            return wrapped, font
    return _wrap_text(text, max(8, width // 8)), _font(9)


def _render_region(
    draw: ImageDraw.ImageDraw,
    region: RenderRegion,
    replacement_mode: str,
) -> None:
    x1, y1, x2, y2 = _bbox_tuple(region.bounding_box)
    padding = int((region.render_style or {}).get("padding", 6))
    text = _text_for(region, replacement_mode)
    if not text:
        return

    if replacement_mode in {ReplacementMode.REPLACE.value, ReplacementMode.BILINGUAL.value}:
        draw.rounded_rectangle((x1, y1, x2, y2), radius=8, fill="white")
    elif replacement_mode == ReplacementMode.OVERLAY.value:
        draw.rounded_rectangle((x1, y1, x2, y2), radius=8, fill=(255, 255, 255), outline="black")

    max_width = max(8, (x2 - x1) - padding * 2)
    max_height = max(8, (y2 - y1) - padding * 2)
    wrapped, font = _fit_text(draw, text, max_width, max_height)
    text_bbox = draw.multiline_textbbox((0, 0), wrapped, font=font, spacing=3, align="center")
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]
    tx = x1 + ((x2 - x1) - text_width) / 2
    ty = y1 + ((y2 - y1) - text_height) / 2
    draw.multiline_text((tx, ty), wrapped, fill="black", font=font, align="center", spacing=3)


def _add_side_panel(canvas: Image.Image, regions: list[RenderRegion]) -> Image.Image:
    panel_width = max(260, math.ceil(canvas.width * 0.28))
    output = Image.new("RGB", (canvas.width + panel_width, canvas.height), "white")
    output.paste(canvas, (0, 0))
    draw = ImageDraw.Draw(output)
    x = canvas.width + 18
    y = 20
    font = _font(16)
    title_font = _font(20)
    draw.text((x, y), "Translation", fill="black", font=title_font)
    y += 36
    for index, region in enumerate(regions, start=1):
        text = region.translated_text or ""
        if not text:
            continue
        wrapped = _wrap_text(f"{index}. {text}", max(18, panel_width // 9))
        draw.multiline_text((x, y), wrapped, fill="black", font=font, spacing=4)
        y += draw.multiline_textbbox((x, y), wrapped, font=font, spacing=4)[3] - y + 16
    return output


def _render_subtitles(canvas: Image.Image, regions: list[RenderRegion]) -> Image.Image:
    output = canvas.copy()
    draw = ImageDraw.Draw(output)
    subtitles = "  /  ".join(region.translated_text or "" for region in regions if region.translated_text)
    if not subtitles:
        return output
    box_height = max(70, canvas.height // 9)
    draw.rectangle((0, canvas.height - box_height, canvas.width, canvas.height), fill=(255, 255, 255))
    font = _font(max(14, box_height // 4))
    wrapped, _ = _fit_text(draw, subtitles, canvas.width - 30, box_height - 20)
    draw.multiline_text((15, canvas.height - box_height + 12), wrapped, fill="black", font=font, spacing=4)
    return output

