import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QQ Hotpot BBQ — Management",
    short_name: "QQ POS",
    description: "QQ Hotpot BBQ restaurant management & POS",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#b91c1c",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
