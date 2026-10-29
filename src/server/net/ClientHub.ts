import type { IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import type { ClientMessage, ClientRole, ServerMessage } from "../../shared/protocol.js";
import { RateLimiter, type RateLimitRule } from "../pipeline/RateLimiter.js";
import { parseClientMessage } from "../validation.js";

/** Visão de uma conexão para os handlers de negócio. */
export interface ClientContext {
  readonly id: string;
  readonly role: ClientRole | null;
  send(message: ServerMessage): void;
}

export interface HubHandler {
  onHello(client: ClientContext, role: ClientRole): void;
  onMessage(client: ClientContext, message: ClientMessage): void;
}

interface ClientState {
  id: string;
  socket: WebSocket;
  role: ClientRole | null;
  alive: boolean;
}

export interface ClientHubOptions {
  commandRate: RateLimitRule;
  now: () => number;
  heartbeatMs: number;
  log?: (message: string) => void;
}

/**
 * Gerencia as conexões WebSocket: identificação por papel, limite de comandos por
 * conexão, validação de mensagens e heartbeat para descartar conexões mortas.
 */
export class ClientHub {
  private readonly clients = new Map<WebSocket, ClientState>();
  private readonly commandLimiter: RateLimiter;
  private readonly log: (message: string) => void;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private sequence = 0;

  constructor(
    private readonly wss: WebSocketServer,
    private readonly handler: HubHandler,
    private readonly options: ClientHubOptions,
  ) {
    this.commandLimiter = new RateLimiter(options.commandRate, options.now);
    this.log = options.log ?? ((message) => console.log(message));
  }

  attach(): void {
    this.wss.on("connection", (socket: WebSocket, request: IncomingMessage) => this.onConnection(socket, request));
    this.heartbeatTimer = setInterval(() => this.runHeartbeat(), this.options.heartbeatMs);
  }

  broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const state of this.clients.values()) {
      if (state.role === null || state.socket.readyState !== WebSocket.OPEN) continue;
      this.safeSend(state.socket, payload);
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }

  dispose(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    for (const state of this.clients.values()) state.socket.terminate();
    this.clients.clear();
  }

  private onConnection(socket: WebSocket, request: IncomingMessage): void {
    this.sequence += 1;
    const state: ClientState = { id: `c${this.sequence}`, socket, role: null, alive: true };
    this.clients.set(socket, state);
    this.log(`cliente ${state.id} conectado (${request.socket.remoteAddress ?? "desconhecido"})`);

    socket.on("pong", () => {
      state.alive = true;
    });
    socket.on("message", (data: RawData) => this.onMessage(state, data));
    socket.on("close", () => {
      this.clients.delete(socket);
      this.log(`cliente ${state.id} desconectado`);
    });
    socket.on("error", (error: Error) => {
      this.log(`erro no cliente ${state.id}: ${error.message}`);
    });
  }

  private onMessage(state: ClientState, data: RawData): void {
    const context = this.contextFor(state);
    if (!this.commandLimiter.tryConsume(state.id)) {
      context.send({ type: "error", message: "mensagens demais; aguarde um instante" });
      return;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(data.toString());
    } catch {
      context.send({ type: "error", message: "JSON inválido" });
      return;
    }

    const parsed = parseClientMessage(parsedJson);
    if (!parsed.ok) {
      context.send({ type: "error", message: parsed.error });
      return;
    }

    const message = parsed.value;
    if (message.type === "hello") {
      if (state.role !== null) {
        context.send({ type: "error", message: "conexão já identificada" });
        return;
      }
      state.role = message.role;
      this.handler.onHello(this.contextFor(state), message.role);
      return;
    }

    if (state.role === null) {
      context.send({ type: "error", message: "identifique-se com hello antes de enviar comandos" });
      return;
    }
    this.handler.onMessage(this.contextFor(state), message);
  }

  private contextFor(state: ClientState): ClientContext {
    return {
      id: state.id,
      role: state.role,
      send: (message) => this.safeSend(state.socket, JSON.stringify(message)),
    };
  }

  private safeSend(socket: WebSocket, payload: string): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(payload);
    } catch (error) {
      this.log(`falha ao enviar mensagem: ${(error as Error).message}`);
    }
  }

  private runHeartbeat(): void {
    for (const state of this.clients.values()) {
      if (!state.alive) {
        this.log(`cliente ${state.id} sem resposta; encerrando conexão`);
        state.socket.terminate();
        this.clients.delete(state.socket);
        continue;
      }
      state.alive = false;
      state.socket.ping();
    }
  }
}
