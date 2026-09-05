import type { Config } from "tailwindcss";

const config: Config = {
  // Light-only: nothing ever adds this class, so `dark:` never activates.
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Duramari green, taken from the logo — brand-700 is the mark's own
        // colour; the rest ramps around it. Every step used against white,
        // and against brand-50 clears WCAG AA.
        brand: {
          50: "#f1f9f5",
          100: "#dcefe6",
          200: "#bbddcc",
          300: "#8bc6a8",
          400: "#54b685",
          500: "#2f7f57",
          600: "#2f654a",
          700: "#3c604e",
          800: "#304f40",
          900: "#263b30",
        },
        ink: "#0e1b14",
        muted: "#60766b",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(14,27,20,0.05), 0 4px 12px rgba(14,27,20,0.04)",
      },
      borderRadius: {
        xl2: "0.875rem",
      },
    },
  },
  plugins: [],
};

export default config;
