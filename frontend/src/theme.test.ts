import { describe, expect, it } from "vitest";

import indexHtml from "../index.html?raw";
import uploadDropzoneSource from "./components/UploadDropzone.tsx?raw";
import globalStyles from "./styles.css?raw";
import {
  brandColors,
  comicFontFamily,
  interfaceFontFamily,
  semanticColors,
  themeColors,
} from "./theme";

function relativeLuminance(hex: string): number {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );

  if (!channels || channels.length !== 3) {
    throw new Error(`Expected a six-digit hex color, received ${hex}`);
  }

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));

  return (lighter + 0.05) / (darker + 0.05);
}

function compositeHex(foreground: string, background: string, alpha: number): string {
  const foregroundChannels = foreground.replace("#", "").match(/.{2}/g);
  const backgroundChannels = background.replace("#", "").match(/.{2}/g);

  if (!foregroundChannels || !backgroundChannels) {
    throw new Error("Expected six-digit hex colors");
  }

  const channels = foregroundChannels.map((channel, index) => {
    const foregroundValue = Number.parseInt(channel, 16);
    const backgroundValue = Number.parseInt(backgroundChannels[index], 16);
    return Math.round(foregroundValue * alpha + backgroundValue * (1 - alpha));
  });

  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

describe("ImageTranslator theme foundation", () => {
  it("publishes the exact brand palette through semantic and Tailwind roles", () => {
    expect(brandColors).toEqual({
      olive: "#636B2F",
      hunter: "#2C5F34",
      moss: "#7E8C54",
    });
    expect(semanticColors).toMatchObject({
      action: brandColors.hunter,
      actionHover: brandColors.olive,
      accent: brandColors.moss,
      focus: brandColors.moss,
      success: brandColors.moss,
      successContent: semanticColors.content,
    });

    expect(themeColors.brand).toEqual(brandColors);
    expect(themeColors.canvas).toBe(semanticColors.canvas);
    expect(themeColors.content).toBe(semanticColors.content);
    expect(themeColors.action).toEqual({
      DEFAULT: semanticColors.action,
      hover: semanticColors.actionHover,
    });
    expect(themeColors.accent).toBe(semanticColors.accent);
    expect(themeColors.focus).toBe(semanticColors.focus);
    expect(themeColors.success).toBe(semanticColors.success);
    expect(themeColors["success-content"]).toBe(semanticColors.successContent);
    expect(themeColors.warning).toBe(semanticColors.warning);
    expect(themeColors.danger).toBe(semanticColors.danger);
  });

  it("uses Inter for interface typography while preserving comic output fonts", () => {
    expect(interfaceFontFamily).toEqual(["Inter Variable", "Inter", "system-ui", "sans-serif"]);
    expect(comicFontFamily).toEqual(["Comic Sans MS", "Comic Sans", "cursive"]);
    expect(JSON.stringify(interfaceFontFamily)).not.toContain("Space Grotesk");
  });

  it("uses ImageTranslator metadata without remote or legacy font branding", () => {
    expect(indexHtml).toContain("<title>ImageTranslator</title>");
    expect(indexHtml).toContain(
      'content="ImageTranslator workspace for manga and comic translation."',
    );
    expect(indexHtml).toContain('name="theme-color"');
    expect(indexHtml).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/i);
    expect(indexHtml).not.toMatch(/Space Grotesk|ComicFlow/i);
  });

  it("keeps shipped foundation chrome free of prototype purple and cyan effects", () => {
    const foundationSource = `${indexHtml}\n${globalStyles}\n${uploadDropzoneSource}`;

    expect(foundationSource).not.toMatch(/#8b5cf6|#22d3ee|rgba\(139\s*,\s*92\s*,\s*246|rgba\(34\s*,\s*211\s*,\s*238/i);
  });

  it.each([
    ["content on canvas", semanticColors.content, semanticColors.canvas],
    ["muted content on canvas", semanticColors.contentMuted, semanticColors.canvas],
    ["filled action", semanticColors.content, semanticColors.action],
    ["filled action hover", semanticColors.content, semanticColors.actionHover],
    ["selected content", semanticColors.canvas, semanticColors.accent],
    ["warning on canvas", semanticColors.warning, semanticColors.canvas],
    ["danger on canvas", semanticColors.danger, semanticColors.canvas],
  ])("meets WCAG AA contrast for %s", (_name, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps success copy and strong interactive boundaries contrast-safe", () => {
    const successSurface = compositeHex(
      semanticColors.success,
      semanticColors.surfaceHigh,
      0.1,
    );

    expect(contrastRatio(semanticColors.successContent, successSurface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(semanticColors.borderStrong, semanticColors.surfaceHigh)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(semanticColors.borderStrong, semanticColors.canvas)).toBeGreaterThanOrEqual(3);
  });
});
