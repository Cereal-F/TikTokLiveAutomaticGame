import { defaultSocketUrl, ReconnectingSocket, type ConnectionState } from "../../client/net/ReconnectingSocket.js";
import type { LiveEvent } from "../../shared/events.js";
import type { ServerMessage } from "../../shared/protocol.js";
import { LiveEventInbox } from "../core/LiveEventInbox.js";

/**
 * Liga o jogo ao servidor local. Eventos chegam por WebSocket e ficam numa fila que a
 * cena drena a cada quadro, assim a partida nunca depende da rede para continuar.
 */
export class LiveFeed {
  private readonly inbox = new LiveEventInbox(200);
  private socket: ReconnectingSocket | null = null;

  constructor(private readonly onConnectionChange: (state: ConnectionState) => void) {}

  start(): void {
    if (this.socket) return;
    this.socket = new ReconnectingSocket({
      url: defaultSocketUrl(),
      role: "game",
      onMessage: (message: ServerMessage) => this.handleMessage(message),
      onState: this.onConnectionChange,
    });
    this.socket.start();
  }

  stop(): void {
    this.socket?.stop();
    this.socket = null;
  }

  drain(): LiveEvent[] {
    return this.inbox.drain();
  }

  private handleMessage(message: ServerMessage): void {
    if (message.type === "live:event") {
      this.inbox.push(message.event);
    }
  }
}
