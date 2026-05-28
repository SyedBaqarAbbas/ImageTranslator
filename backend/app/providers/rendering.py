from __future__ import annotations

import io
import math
import textwrap
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Protocol

from PIL import Image, ImageColor, ImageDraw, ImageFont

from app.core.enums import ReplacementMode

DEFAULT_FILL_OPACITY = 0.27
FONT_CANDIDATES = (
    "Comic Sans MS Bold.ttf",
    "Comic Sans MS.ttf",
    "/System/Library/Fonts/Supplemental/Comic Sans MS Bold.ttf",
    "/System/Library/Fonts/Supplemental/Comic Sans MS.ttf",
    "/Library/Fonts/Comic Sans MS Bold.ttf",
    "/Library/Fonts/Comic Sans MS.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "DejaVuSans-Bold.ttf",
    "DejaVuSans.ttf",
)


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
            for region in regions:
                _render_region(canvas, region, replacement_mode)

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


@lru_cache(maxsize=128)
def _font(size: int) -> ImageFont.ImageFont:
    for candidate in FONT_CANDIDATES:
        if "/" in candidate and not Path(candidate).exists():
            continue
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue

    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def _wrap_text(text: str, max_chars: int) -> str:
    lines: list[str] = []
    for paragraph in text.splitlines() or [""]:
        lines.extend(textwrap.wrap(paragraph, width=max(4, max_chars)) or [""])
    return "\n".join(lines)


def _line_width(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> float:
    try:
        return draw.textlength(text, font=font)
    except AttributeError:
        bbox = draw.textbbox((0, 0), text, font=font)
        return bbox[2] - bbox[0]


def _wrap_text_to_width(
    draw: ImageDraw.ImageDraw,
    text: str,
    width: int,
    font: ImageFont.ImageFont,
) -> str:
    lines: list[str] = []
    for paragraph in text.splitlines() or [""]:
        normalized = " ".join(paragraph.split())
        if not normalized:
            lines.append("")
            continue

        current = ""
        last_break: int | None = None
        for character in normalized:
            candidate = f"{current}{character}"
            if character in {" ", "-"}:
                last_break = len(candidate) - 1
            if _line_width(draw, candidate, font) <= width or not current:
                current = candidate
                continue

            if last_break is not None and 0 < last_break < len(current):
                line = (
                    current[:last_break]
                    if current[last_break] == " "
                    else current[: last_break + 1]
                )
                lines.append(line.rstrip())
                current = current[last_break + 1 :].lstrip() + character
            else:
                lines.append(current.rstrip())
                current = "" if character == " " else character
            last_break = next(
                (
                    index
                    for index, value in reversed(list(enumerate(current)))
                    if value in {" ", "-"}
                ),
                None,
            )

        if current:
            lines.append(current.rstrip())
    return "\n".join(lines)


def _fit_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    width: int,
    height: int,
    preferred_size: int | None = None,
) -> tuple[str, ImageFont.ImageFont]:
    start_size = min(42, max(12, height // 3))
    if preferred_size is not None:
        size = min(72, max(9, preferred_size))
        font = _font(size)
        return _wrap_text_to_width(draw, text, width, font), font
    for size in range(start_size, 8, -1):
        font = _font(size)
        wrapped = _wrap_text_to_width(draw, text, width, font)
        bbox = draw.multiline_textbbox((0, 0), wrapped, font=font, spacing=max(2, size // 6))
        if (bbox[2] - bbox[0]) <= width and (bbox[3] - bbox[1]) <= height:
            return wrapped, font
    return _wrap_text(text, max(8, width // 8)), _font(9)


def _style_color(style: dict, keys: tuple[str, ...], fallback: str) -> tuple[int, int, int]:
    for key in keys:
        value = style.get(key)
        if isinstance(value, str) and value.strip():
            try:
                return ImageColor.getrgb(value.strip())[:3]
            except ValueError:
                continue
        if isinstance(value, (list, tuple)) and len(value) >= 3:
            try:
                red, green, blue = (max(0, min(255, int(channel))) for channel in value[:3])
                return red, green, blue
            except (TypeError, ValueError):
                continue
    return ImageColor.getrgb(fallback)


def _style_int(style: dict, key: str, fallback: int | None = None) -> int | None:
    value = style.get(key)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(float(value))
        except ValueError:
            return fallback
    return fallback


def _style_float(style: dict, key: str, fallback: float) -> float:
    value = style.get(key)
    if isinstance(value, bool):
        return fallback
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return fallback
    return fallback


def _style_opacity(style: dict, key: str, fallback: float = DEFAULT_FILL_OPACITY) -> float:
    value = _style_float(style, key, fallback)
    if not math.isfinite(value):
        return fallback
    return max(0.0, min(1.0, value))


def _draw_rounded_fill(
    canvas: Image.Image,
    bbox: tuple[int, int, int, int],
    fill: tuple[int, int, int],
    opacity: float,
) -> None:
    if opacity <= 0:
        return

    if opacity >= 1:
        ImageDraw.Draw(canvas).rounded_rectangle(bbox, radius=8, fill=fill)
        return

    left = max(0, bbox[0])
    top = max(0, bbox[1])
    right = min(canvas.width, bbox[2] + 1)
    bottom = min(canvas.height, bbox[3] + 1)
    if right <= left or bottom <= top:
        return

    crop_box = (left, top, right, bottom)
    base = canvas.crop(crop_box).convert("RGBA")
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.rounded_rectangle(
        (bbox[0] - left, bbox[1] - top, bbox[2] - left, bbox[3] - top),
        radius=8,
        fill=(*fill, round(opacity * 255)),
    )
    composed = Image.alpha_composite(base, overlay).convert(canvas.mode)
    canvas.paste(composed, (left, top))


def _draw_multiline_text_clipped(
    canvas: Image.Image,
    clip_box: tuple[int, int, int, int],
    position: tuple[float, float],
    text: str,
    fill: tuple[int, int, int],
    font: ImageFont.ImageFont,
    spacing: int,
) -> None:
    left = max(0, clip_box[0])
    top = max(0, clip_box[1])
    right = min(canvas.width, clip_box[2])
    bottom = min(canvas.height, clip_box[3])
    if right <= left or bottom <= top:
        return

    crop_box = (left, top, right, bottom)
    base = canvas.crop(crop_box).convert("RGBA")
    text_layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    layer_draw = ImageDraw.Draw(text_layer)
    layer_draw.multiline_text(
        (position[0] - left, position[1] - top),
        text,
        fill=(*fill, 255),
        font=font,
        align="center",
        spacing=spacing,
    )
    composed = Image.alpha_composite(base, text_layer).convert(canvas.mode)
    canvas.paste(composed, (left, top))


def _render_region(
    canvas: Image.Image,
    region: RenderRegion,
    replacement_mode: str,
) -> None:
    x1, y1, x2, y2 = _bbox_tuple(region.bounding_box)
    style = region.render_style or {}
    padding = _style_int(style, "padding", 6) or 6
    background_color = _style_color(
        style,
        ("backgroundColor", "background_color", "fillColor", "fill"),
        "white",
    )
    fill_opacity = _style_opacity(style, "fillOpacity")
    outline_color = _style_color(style, ("outlineColor", "outline_color"), "black")
    text_color = _style_color(style, ("textColor", "text_color", "color"), "black")
    preferred_font_size = _style_int(style, "fontSize")
    text = _text_for(region, replacement_mode)
    if not text:
        return

    if replacement_mode in {ReplacementMode.REPLACE.value, ReplacementMode.BILINGUAL.value}:
        _draw_rounded_fill(canvas, (x1, y1, x2, y2), background_color, fill_opacity)
    elif replacement_mode == ReplacementMode.OVERLAY.value:
        _draw_rounded_fill(canvas, (x1, y1, x2, y2), background_color, fill_opacity)
        draw = ImageDraw.Draw(canvas)
        draw.rounded_rectangle(
            (x1, y1, x2, y2),
            radius=8,
            outline=outline_color,
        )

    draw = ImageDraw.Draw(canvas)
    max_width = max(8, (x2 - x1) - padding * 2)
    max_height = max(8, (y2 - y1) - padding * 2)
    wrapped, font = _fit_text(draw, text, max_width, max_height, preferred_font_size)
    text_bbox = draw.multiline_textbbox((0, 0), wrapped, font=font, spacing=3, align="center")
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]
    tx = x1 + ((x2 - x1) - text_width) / 2 - text_bbox[0]
    ty = y1 + ((y2 - y1) - text_height) / 2 - text_bbox[1]
    _draw_multiline_text_clipped(
        canvas,
        (x1 + padding, y1 + padding, x2 - padding, y2 - padding),
        (tx, ty),
        wrapped,
        text_color,
        font,
        3,
    )


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
    subtitles = "  /  ".join(
        region.translated_text or "" for region in regions if region.translated_text
    )
    if not subtitles:
        return output
    box_height = max(70, canvas.height // 9)
    draw.rectangle(
        (0, canvas.height - box_height, canvas.width, canvas.height),
        fill=(255, 255, 255),
    )
    font = _font(max(14, box_height // 4))
    wrapped, _ = _fit_text(draw, subtitles, canvas.width - 30, box_height - 20)
    draw.multiline_text(
        (15, canvas.height - box_height + 12),
        wrapped,
        fill="black",
        font=font,
        spacing=4,
    )
    return output
