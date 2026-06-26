import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#C41E3A", // QQ logo red
          dark:    "#9B1530",
          light:   "#FFF0F2",
        },
        gold: {
          DEFAULT: "#E8A800", // QQ logo gold
          dark:    "#C48E00",
          light:   "#FDF8E1",
        },
      },
    },
  },
  plugins: [],
};

export default config;
