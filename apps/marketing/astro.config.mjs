// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
//
// Output is static — Cloudflare Pages serves `dist/` directly.
// React islands hydrate client-side, no SSR adapter required.
//
// The `react-native` → `react-native-web` alias lets us share UI
// components with `apps/mobile` via the `@harpa/ui-voice` workspace
// package. See `docs/v4/arch-ui-voice.md`.
export default defineConfig({
  site: "https://harpapro.com",
  output: "static",
  integrations: [react(), mdx()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "react-native": "react-native-web",
      },
    },
    optimizeDeps: {
      include: ["react-native-web", "@harpa/ui-voice"],
    },
    ssr: {
      // Astro pre-renders island HTML during static build. The shared
      // package and its RN-Web/NativeWind deps must be bundled inline
      // for SSR rather than treated as external CJS modules.
      noExternal: [
        "@harpa/ui-voice",
        "react-native-web",
        "nativewind",
        "react-native-css-interop",
      ],
    },
  },
});
