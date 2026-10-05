import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hosts allowed to reach the dev server. The sandbox live-preview is served
// from https://<port>-<sandboxId>.e2b.app, so its Host header has to be
// whitelisted or Vite answers 403 and the preview shows an error page.
const previewHost = process.env.ARENA_PREVIEW_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  server: {
    host: true,
    allowedHosts: previewHost ? [previewHost] : true,
  },
  preview: {
    host: true,
    allowedHosts: previewHost ? [previewHost] : true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
