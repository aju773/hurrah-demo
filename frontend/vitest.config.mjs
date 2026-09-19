import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react({ include: /\.[jt]sx?$/ })],
  // Components are .js files that contain JSX.
  oxc: { include: /src\/.*\.[jt]sx?$/, lang: "jsx" },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{js,jsx}"],
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
