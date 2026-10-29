import type { ClientMessage, ClientRole, ServerMessage } from "../../shared/protocol.js";
import { nextBackoffMs } from "./backoff.js";

export type ConnectionState = "connecting" | "open" | "closed";

export interface ReconnectingSocketOptions {
  url: string;
  role: ClientRole;
  onMessage: (message: ServerMessage) => void;
  onState: (state: ConnectionState) => void;
  minDelayMs?: number;
  maxDelayMs?: number;
}

/** URL do WebSocket no mesmo host que serviu a página. */
export function defaultSocketUrl(location: Location = window.location): string {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${location.host}/ws`;
}

/**
 * WebSocket que se reconecta sozinho com backoff. Falhas de rede não interrompem a
 * aplicação: ela continua operando e só o estado de conexão muda.
 */
export class ReconnectingSocket {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private running = false;

  constructor(private readonly options: ReconnectingSocketOptions) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.options.onState("closed");
  }

  /** Envia uma mensagem. Retorna false se a conexão não estiver aberta. */
  send(message: ClientMessage): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  private connect(): void {
    this.options.onState("connecting");
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.options.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.attempt = 0;
      this.options.onState("open");
      this.send({ type: "hello", role: this.options.role });
    });

    socket.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (typeof event.data !== "string") return;
      try {
        const parsed: unknown = JSON.parse(event.data);
        if (typeof parsed === "object" && parsed !== null && typeof (parsed as { type?: unknown }).type === "string") {
          this.options.onMessage(parsed as ServerMessage);
        }
      } catch {
        // Mensagem malformada é ignorada; a conexão continua.
      }
    });

    socket.addEventListener("close", () => {
      if (this.socket === socket) this.socket = null;
      this.options.onState("closed");
      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      // O evento "close" acompanha erros; a reconexão é tratada ali.
    });
  }

  private scheduleReconnect(): void {
    if (!this.running) return;
    const delay = nextBackoffMs(this.attempt, this.options.minDelayMs ?? 500, this.options.maxDelayMs ?? 5_000);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.running) this.connect();
    }, delay);
  }
}
