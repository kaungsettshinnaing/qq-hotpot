import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#b91c1c", // red-700 — hotpot red
          dark: "#7f1d1d",
          light: "#fee2e2",
        },
      },
    },
  },
  plugins: [],
};

export default config;
