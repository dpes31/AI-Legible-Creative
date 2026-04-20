import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: {
          low: "var(--surface-low)",
          lowest: "var(--surface-lowest)",
          bright: "var(--surface-bright)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          container: "var(--primary-container)",
          foreground: "var(--on-primary)",
        },
        outline: {
          variant: "var(--outline-variant)"
        }
      },
      boxShadow: {
        ambient: "var(--shadow-ambient)",
        glass: "var(--shadow-glass)",
      }
    },
  },
  plugins: [],
};
export default config;
