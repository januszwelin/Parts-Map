import type { MetadataRoute } from "next";

/* Next serves this at /manifest.webmanifest and injects the <link> tag
   itself — nothing to wire up in layout.tsx. No service worker: the
   maps this app holds are sensitive, so there is deliberately nothing
   here that could cache a map's contents (see CLAUDE.md — "no
   autosave, no storage" was already a deliberate choice for the same
   reason). Manifest + HTTPS + icons is enough for the install prompt on
   Android/Chrome and for iOS's Add to Home Screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Parts Map",
    short_name: "Parts Map",
    description: "A spatial canvas for IFS parts work",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f5f1",
    theme_color: "#f7f5f1",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
