import { createGameServer } from "./app.js";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createGameServer(config);

  const shutdown = (signal: string): void => {
    console.log(`[servidor] ${signal} recebido, encerrando...`);
    server
      .stop()
      .catch((error: unknown) => console.error("[servidor] erro ao encerrar:", error))
      .finally(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await server.start();
}

main().catch((error: unknown) => {
  console.error("[servidor] falha ao iniciar:", error instanceof Error ? error.message : error);
  process.exit(1);
});
