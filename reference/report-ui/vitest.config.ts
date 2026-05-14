/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      // react-native's main entry uses Flow's `import typeof` syntax which
      // vitest's SSR transformer can't parse. The web entry is plain JS.
      "react-native": "react-native-web",
    },
  },
});
