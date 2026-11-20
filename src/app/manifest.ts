import type { MetadataRoute } from "next";

export const dynamic = "force-static";

// Lets Edge or Chrome install LifeOS as an app on the PC (own window, Start menu entry, taskbar pin).
// Colours repeat the home theme's --bg (a manifest cannot read CSS variables).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "LifeOS",
    short_name: "LifeOS",
    description: "Your life, recorded: habits, tasks, books, games and life areas.",
    start_url: "/today/",
    scope: "/",
    display: "standalone",
    background_color: "#121316",
    theme_color: "#121316",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Today", url: "/today/" },
      { name: "Habits", url: "/habits/" },
      { name: "Life areas", url: "/areas/" },
    ],
  };
}
