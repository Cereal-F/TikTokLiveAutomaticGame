import { defineConfig } from "vitest/config";

// Testes unitários das regras (core, servidor, cliente). Não dependem do Phaser nem do navegador.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
