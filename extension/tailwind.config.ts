import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        background: "#050505",
        foreground: "#fafafa",
        card: "#0b0b0c",
        muted: "#a1a1aa",
        border: "rgba(255,255,255,0.1)",
        accent: "#8b9cff",
        success: "#58d68d",
        warning: "#f5b971",
        danger: "#ff7a7a"
      },
      boxShadow: {
        panel: "0 16px 40px rgba(0, 0, 0, 0.35)"
      },
      fontFamily: {
        sans: [
          "\"SF Pro Display\"",
          "\"Segoe UI Variable\"",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ]
      },
      backgroundImage: {
        "grid-radial":
          "radial-gradient(circle at top, rgba(139,156,255,0.18), transparent 38%), radial-gradient(circle at bottom right, rgba(255,255,255,0.08), transparent 24%)"
      }
    }
  },
  plugins: []
} satisfies Config;
