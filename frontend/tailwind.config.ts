import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#080A12",
        surface: "#11131A",
        "surface-low": "#151822",
        "surface-mid": "#1A1D28",
        "surface-high": "#202431",
        "surface-higher": "#262A3A",
        "ink-border": "#252B3A",
        "ink-border-strong": "#374151",
        primary: "#8B5CF6",
        "primary-soft": "#D0BCFF",
        secondary: "#22D3EE",
        tertiary: "#FFB869",
        "text-main": "#F3F4F6",
        "text-muted": "#9CA3AF",
        "text-soft": "#CBC3D7",
        danger: "#FFB4AB",
      },
      fontFamily: {
        display: ["Space Grotesk", "Inter", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        comic: ["Comic Sans MS", "Comic Sans", "cursive"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(139, 92, 246, 0.24)",
        cyan: "0 0 20px rgba(34, 211, 238, 0.24)",
        panel: "0 18px 80px rgba(0, 0, 0, 0.28)",
      },
      borderRadius: {
        instrument: "4px",
      },
    },
  },
  plugins: [],
} satisfies Config;
