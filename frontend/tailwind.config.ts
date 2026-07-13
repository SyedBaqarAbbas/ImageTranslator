import type { Config } from "tailwindcss";

import {
  comicFontFamily,
  interfaceFontFamily,
  themeColors,
} from "./src/theme";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: themeColors,
      fontFamily: {
        display: [...interfaceFontFamily],
        body: [...interfaceFontFamily],
        comic: [...comicFontFamily],
      },
      boxShadow: {
        action: "0 14px 32px rgba(0, 0, 0, 0.34)",
        focus: "0 0 0 1px rgba(126, 140, 84, 0.44), 0 12px 32px rgba(0, 0, 0, 0.3)",
        panel: "0 22px 64px rgba(0, 0, 0, 0.34)",
      },
      borderRadius: {
        instrument: "4px",
      },
    },
  },
  plugins: [],
} satisfies Config;
