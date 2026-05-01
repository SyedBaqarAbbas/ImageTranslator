export const DEFAULT_FILL_OPACITY = 0.27;

export type RenderStyle = Record<string, unknown> | null | undefined;

export function clampFillOpacity(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_FILL_OPACITY;
  }
  return Math.min(1, Math.max(0, value));
}

export function fillOpacityFromStyle(style: RenderStyle, fallback = DEFAULT_FILL_OPACITY): number {
  const value = style?.fillOpacity;
  if (typeof value === "number") {
    return clampFillOpacity(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? clampFillOpacity(parsed) : fallback;
  }
  return fallback;
}

export function fillOpacityPercent(opacity: number): string {
  return `${Math.round(clampFillOpacity(opacity) * 100)}%`;
}

function opacityString(opacity: number): string {
  return String(Number(clampFillOpacity(opacity).toFixed(2)));
}

function parseHexColor(value: string): [number, number, number] | null {
  const trimmed = value.trim();
  const shortMatch = /^#([0-9a-f]{3})$/i.exec(trimmed);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split("").map((character) => Number.parseInt(`${character}${character}`, 16));
    return [r, g, b];
  }

  const longMatch = /^#([0-9a-f]{6})$/i.exec(trimmed);
  if (longMatch) {
    return [0, 2, 4].map((index) => Number.parseInt(longMatch[1].slice(index, index + 2), 16)) as [number, number, number];
  }

  return null;
}

export function fillColorWithOpacity(value: string, opacity: number): string {
  const trimmed = value.trim();
  const color = parseHexColor(trimmed);
  if (color) {
    const [red, green, blue] = color;
    return `rgba(${red}, ${green}, ${blue}, ${opacityString(opacity)})`;
  }

  const clampedOpacity = clampFillOpacity(opacity);
  if (clampedOpacity === 0) {
    return "transparent";
  }
  if (clampedOpacity === 1) {
    return trimmed;
  }

  return `color-mix(in srgb, ${trimmed} ${Number((clampedOpacity * 100).toFixed(2))}%, transparent)`;
}
