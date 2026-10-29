import { fileURLToPath } from "node:url";
import type { ProviderKind } from "../shared/protocol.js";
import { isLocalWebSocketUrl } from "./live/tikfinity/localUrl.js";

export interface ServerConfig {
  host: string;
  port: number;
  provider: ProviderKind;
  /** WebSocket local do TikFinity (apenas ws:// para localhost). */
  tikfinityUrl: string;
  /** Pasta com o build do cliente (saída do `vite build`). */
  staticRoot: string;
  /** Arquivo JSON com o recorde de ondas (fica fora do código e é ignorado pelo git). */
  recordsFile: string;
}

const DEFAULT_PORT = 3000;
export const DEFAULT_TIKFINITY_URL = "ws://localhost:21213/";

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
  if (providerRaw !== "simulation" && providerRaw !== "tikfinity") {
    throw new Error(`LIVE_PROVIDER deve ser "simulation" ou "tikfinity" (recebido: ${providerRaw})`);
  }

  const tikfinityUrl = env.TIKFINITY_URL?.trim() || DEFAULT_TIKFINITY_URL;
  if (!isLocalWebSocketUrl(tikfinityUrl)) {
    throw new Error("TIKFINITY_URL deve ser ws://localhost:<porta> (somente a própria máquina)");
  }

  return {
    host: env.HOST ?? "127.0.0.1",
    port,
    provider: providerRaw,
    tikfinityUrl,
    staticRoot: fileURLToPath(new URL("../../dist/client", import.meta.url)),
    recordsFile: fileURLToPath(new URL("../../data/records.json", import.meta.url)),
  };
}
