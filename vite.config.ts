import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Default "/" keeps dev, e2e (Playwright baseURL), and normal builds working.
  // The GitHub Pages deploy job sets VITE_BASE=/family-office-os/ for the subpath.
  base: process.env.VITE_BASE || "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "convex/**/*.{test,spec}.ts"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    // convex-test relies on its source being transformed by Vitest.
    server: { deps: { inline: ["convex-test"] } },
  },
});
