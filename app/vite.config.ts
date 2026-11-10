import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
export default defineConfig({
  root: "web",
  plugins: [
    react(),
    cloudflare({
      configPath: "../wrangler.jsonc",
      persistState: {
        path: fileURLToPath(new URL("./.wrangler/state", import.meta.url)),
      },
      remoteBindings: false,
      inspectorPort: false,
      auxiliaryWorkers: [{ configPath: "../wrangler.jobs.jsonc" }],
    }),
  ],
  build: { outDir: "../dist", emptyOutDir: true },
  server: { port: 5173, strictPort: true },
});
