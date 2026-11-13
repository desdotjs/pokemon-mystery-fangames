import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Single self-contained HTML so the release build runs by double-clicking (SPEC §3).
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  // Classic (iife) worker: module workers from blob URLs fail when opened via file://.
  worker: { format: "iife" },
  build: { outDir: "dist", assetsInlineLimit: 100_000_000 },
});
