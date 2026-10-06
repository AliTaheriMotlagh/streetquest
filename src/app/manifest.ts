import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: SITE.name,
    description: SITE.description,
    start_url: "/play",
    display: "standalone",
    orientation: "portrait",
    background_color: "#07070d",
    theme_color: "#07070d",
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png" }],
    categories: ["games", "travel", "social"],
  };
}
