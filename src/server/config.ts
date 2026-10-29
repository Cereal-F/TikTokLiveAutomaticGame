import { fileURLToPath } from "node:url";
import type { ProviderKind } from "../shared/protocol.js";

export interface ServerConfig {
  host: string;
  port: number;
  provider: ProviderKind;
  tiktokUsername?: string;
  /** Pasta com o build do cliente (saída do `vite build`). */
  staticRoot: string;
}

const DEFAULT_PORT = 3000;

/**
 * Lê a configuração de variáveis de ambiente.
 * Nenhum segredo é lido nem exposto ao frontend: o jogo recebe apenas eventos normalizados.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = env.PORT === undefined ? DEFAULT_PORT : Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT inválida: ${env.PORT}`);
  }

  const providerRaw = env.LIVE_PROVIDER ?? "simulation";
  if (providerRaw !== "simulation" && providerRaw !== "tiktok") {
    throw new Error(`LIVE_PROVIDER deve ser "simulation" ou "tiktok" (recebido: ${providerRaw})`);
  }

  const username = env.TIKTOK_USERNAME?.trim();

  return {
    host: env.HOST ?? "127.0.0.1",
    port,
    provider: providerRaw,
    tiktokUsername: username && username.length > 0 ? username : undefined,
    staticRoot: fileURLToPath(new URL("../../dist/client", import.meta.url)),
  };
}
