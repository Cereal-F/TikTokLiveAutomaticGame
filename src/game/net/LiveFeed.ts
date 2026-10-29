import { defaultSocketUrl, ReconnectingSocket, type ConnectionState } from "../../client/net/ReconnectingSocket.js";
import type { LiveEvent } from "../../shared/events.js";
import type { ClientMessage, LeaderboardEntry, RecordSnapshot, ServerMessage } from "../../shared/protocol.js";
import { LiveEventInbox } from "../core/LiveEventInbox.js";

/** Atualizações vindas do servidor que a cena copia para a HUD uma vez por quadro. */
export interface FeedUpdates {
  leaderboard?: LeaderboardEntry[];
  record?: RecordSnapshot;
}

/**
 * Liga o jogo ao servidor local. Eventos chegam por WebSocket e ficam numa fila que a
 * cena drena a cada quadro, assim a partida nunca depende da rede para continuar.
 */
export class LiveFeed {
  private readonly inbox = new LiveEventInbox(200);
  private socket: ReconnectingSocket | null = null;
  private pendingUpdates: FeedUpdates = {};
  private reportedWave = 0;

  constructor(private readonly onConnectionChange: (state: ConnectionState) => void) {}

  start(): void {
    if (this.socket) return;
    this.socket = new ReconnectingSocket({
      url: defaultSocketUrl(),
      role: "game",
      onMessage: (message: ServerMessage) => this.handleMessage(message),
      onState: (state: ConnectionState) => {
        // Ao (re)conectar, reenvia a maior onda para o servidor não perder um recorde feito offline.
        if (state === "open" && this.reportedWave > 0) this.send({ type: "game:waveReached", wave: this.reportedWave });
        this.onConnectionChange(state);
      },
    });
    this.socket.start();
  }

  stop(): void {
    this.socket?.stop();
    this.socket = null;
  }

  /** Informa a onda alcançada. O servidor guarda o maior valor como recorde. */
  reportWave(wave: number): void {
    if (wave <= this.reportedWave) return;
    this.reportedWave = wave;
    this.send({ type: "game:waveReached", wave });
  }

  drain(): LiveEvent[] {
    return this.inbox.drain();
  }

  /** Retorna as atualizações pendentes (ranking e recorde) e as zera. */
  takeUpdates(): FeedUpdates {
    const updates = this.pendingUpdates;
    this.pendingUpdates = {};
    return updates;
  }

  private send(message: ClientMessage): void {
    this.socket?.send(message);
  }

  private handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case "live:event":
        this.inbox.push(message.event);
        return;
      case "leaderboard":
        this.pendingUpdates.leaderboard = message.entries;
        return;
      case "record":
        this.pendingUpdates.record = message.record;
        return;
      default:
        return;
    }
  }
}
