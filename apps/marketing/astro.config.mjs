// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
//
// Output is static — Cloudflare Pages serves `dist/` directly.
// React islands hydrate client-side, no SSR adapter required.
export default defineConfig({
  site: "https://harpapro.com",
  output: "static",
  integrations: [react(), mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
});
