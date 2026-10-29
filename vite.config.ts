import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

// Vite serve o jogo (index.html) e o painel (admin.html).
// Em desenvolvimento, /ws é encaminhado ao servidor Node local.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/ws": { target: "ws://127.0.0.1:3000", ws: true },
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        game: fileURLToPath(new URL("./index.html", import.meta.url)),
        admin: fileURLToPath(new URL("./admin.html", import.meta.url)),
      },
    },
  },
});
