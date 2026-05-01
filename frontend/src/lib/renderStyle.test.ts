import { describe, expect, it } from "vitest";

import { fillColorWithOpacity, fillOpacityFromStyle, fillOpacityPercent } from "./renderStyle";

describe("renderStyle", () => {
  it("reads fill opacity with defaults and clamping", () => {
    expect(fillOpacityFromStyle(null)).toBe(0.27);
    expect(fillOpacityFromStyle({ fillOpacity: "0.5" })).toBe(0.5);
    expect(fillOpacityFromStyle({ fillOpacity: -1 })).toBe(0);
    expect(fillOpacityFromStyle({ fillOpacity: 2 })).toBe(1);
  });

  it("formats fill opacity as a percentage", () => {
    expect(fillOpacityPercent(0.27)).toBe("27%");
    expect(fillOpacityPercent(0.5)).toBe("50%");
  });

  it("applies opacity to hex fill colors with rgba output", () => {
    expect(fillColorWithOpacity("#fff", 0.5)).toBe("rgba(255, 255, 255, 0.5)");
    expect(fillColorWithOpacity("#336699", 0.27)).toBe("rgba(51, 102, 153, 0.27)");
  });

  it("applies opacity to non-hex CSS fill colors", () => {
    expect(fillColorWithOpacity("white", 0.5)).toBe("color-mix(in srgb, white 50%, transparent)");
    expect(fillColorWithOpacity("var(--region-fill)", 0)).toBe("transparent");
    expect(fillColorWithOpacity("rgb(10 20 30)", 1)).toBe("rgb(10 20 30)");
  });
});
