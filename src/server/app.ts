import http from "node:http";
import { WebSocketServer } from "ws";
import type { LiveEvent } from "../shared/events.js";
import type { ClientMessage, ClientRole, ProviderStatus } from "../shared/protocol.js";
import { AUTO_INTERVAL_LIMITS } from "../shared/protocol.js";
import type { ServerConfig } from "./config.js";
import { ClientHub, type ClientContext, type HubHandler } from "./net/ClientHub.js";
import { EventPipeline } from "./pipeline/EventPipeline.js";
import type { LiveProvider, ProviderSink } from "./live/LiveProvider.js";
import { SimulatedLiveProvider } from "./live/SimulatedLiveProvider.js";
import { TikTokLiveProvider } from "./live/TikTokLiveProvider.js";
import { createStaticHandler } from "./http/staticFiles.js";

export interface GameServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Endereço em que o servidor escuta (disponível após start). */
  readonly address: string;
}

const LIKE_FLUSH_MS = 250;
const HEARTBEAT_MS = 20_000;
const WS_PATH = "/ws";

/**
 * Monta o servidor: HTTP (jogo e painel), WebSocket em /ws, pipeline de eventos
 * e o provedor de live escolhido pela configuração.
 */
export function createGameServer(config: ServerConfig, now: () => number = Date.now): GameServer {
  const log = (message: string): void => console.log(`[servidor] ${message}`);

  const simulator = new SimulatedLiveProvider();
  const provider: LiveProvider =
    config.provider === "tiktok" ? new TikTokLiveProvider({ username: config.tiktokUsername }) : simulator;

  const pipeline = new EventPipeline((event: LiveEvent) => hub.broadcast({ type: "live:event", event }), {
    now,
    dedupeTtlMs: 60_000,
    dedupeMaxSize: 5_000,
    userRateLimits: {
      like: { capacity: 30, refillPerSecond: 10 },
      comment: { capacity: 5, refillPerSecond: 1 },
      gift: { capacity: 3, refillPerSecond: 0.5 },
    },
    globalRateLimit: { capacity: 200, refillPerSecond: 60 },
  });

  const handler: HubHandler = {
    onHello(client: ClientContext, role: ClientRole): void {
      client.send({
        type: "welcome",
        role,
        providerStatus: provider.status(),
        autoEnabled: simulator.autoEnabled,
      });
    },
    onMessage(client: ClientContext, message: ClientMessage): void {
      if (client.role !== "admin") {
        client.send({ type: "error", message: "apenas o painel pode enviar comandos de simulação" });
        return;
      }
      if (provider !== simulator) {
        client.send({ type: "error", message: "simulação desativada (LIVE_PROVIDER=tiktok)" });
        return;
      }
      if (message.type === "admin:simulate") {
        simulator.trigger(message.kind, message.count ?? 1);
      } else if (message.type === "admin:auto") {
        simulator.setAuto(message.enabled, message.intervalMs ?? AUTO_INTERVAL_LIMITS.defaultMs);
      }
    },
  };

  const wss = new WebSocketServer({ noServer: true, path: WS_PATH, maxPayload: 4_096 });
  const hub = new ClientHub(wss, handler, {
    commandRate: { capacity: 15, refillPerSecond: 10 },
    now,
    heartbeatMs: HEARTBEAT_MS,
    log,
  });

  const staticHandler = createStaticHandler(config.staticRoot);
  const httpServer = http.createServer((req, res) => {
    staticHandler(req, res).catch((error: unknown) => {
      log(`erro ao servir arquivo: ${(error as Error).message}`);
      if (!res.headersSent) res.writeHead(500).end("Erro interno");
    });
  });

  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (pathname !== WS_PATH) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  const sink: ProviderSink = {
    onRawEvent(raw: unknown): void {
      const result = pipeline.submit(raw);
      if (!result.accepted && result.reason !== "duplicate") {
        log(`evento descartado (${result.reason}): ${result.detail}`);
      }
    },
    onStatus(status: ProviderStatus): void {
      hub.broadcast({ type: "status", providerStatus: status, autoEnabled: simulator.autoEnabled });
    },
  };

  let flushTimer: ReturnType<typeof setInterval> | null = null;

  const stopTimers = (): void => {
    if (flushTimer) clearInterval(flushTimer);
    flushTimer = null;
  };

  return {
    get address(): string {
      const addr = httpServer.address();
      const port = addr && typeof addr === "object" ? addr.port : config.port;
      return `http://${config.host}:${port}`;
    },

    async start(): Promise<void> {
      hub.attach();
      flushTimer = setInterval(() => pipeline.flushLikes(), LIKE_FLUSH_MS);
      try {
        provider.start(sink);
      } catch (error) {
        log(`falha ao iniciar o provedor de live: ${(error as Error).message}`);
      }

      try {
        await new Promise<void>((resolve, reject) => {
          httpServer.once("error", reject);
          httpServer.listen(config.port, config.host, () => {
            httpServer.off("error", reject);
            resolve();
          });
        });
      } catch (error) {
        stopTimers();
        provider.stop();
        throw error;
      }
      log(`pronto em ${this.address} (provedor: ${provider.kind})`);
    },

    async stop(): Promise<void> {
      stopTimers();
      provider.stop();
      hub.dispose();
      wss.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
