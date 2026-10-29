import WebSocket, { type RawData } from "ws";
import { nextBackoffMs } from "../../shared/backoff.js";
import type { ProviderState, ProviderStatus } from "../../shared/protocol.js";
import type { LiveProvider, ProviderSink } from "./LiveProvider.js";
import { GiftStreakTracker, type CompletedGift } from "./tikfinity/GiftStreakTracker.js";
import { isLocalWebSocketUrl } from "./tikfinity/localUrl.js";
import {
  mapChat,
  mapLike,
  parseEnvelope,
  readGift,
  readMsgId,
  type EventDraft,
} from "./tikfinity/mapping.js";

export interface TikFinityProviderOptions {
  /** WebSocket local do TikFinity, ex.: ws://localhost:21213/ */
  url: string;
  now?: () => number;
  minRetryMs?: number;
  maxRetryMs?: number;
  /** Tempo sem novas mensagens após o qual uma sequência de presentes é concluída. */
  streakTimeoutMs?: number;
  log?: (message: string) => void;
}

const SOURCE = "tikfinity" as const;
const DEFAULTS = {
  minRetryMs: 1_000,
  maxRetryMs: 5_000,
  streakTimeoutMs: 4_000,
} as const;
const FLUSH_INTERVAL_MS = 1_000;
const HANDSHAKE_TIMEOUT_MS = 5_000;
/** Mensagens do TikFinity são pequenas; um limite folgado protege contra payloads gigantes. */
const MAX_PAYLOAD_BYTES = 256 * 1024;

/**
 * Lê eventos do TikFinity pelo WebSocket local (o TikFinity precisa estar aberto no
 * computador). Reconecta sozinho, informa o estado no painel e entrega eventos brutos
 * ao sink, que os valida no pipeline como qualquer outra origem.
 */
export class TikFinityLiveProvider implements LiveProvider {
  readonly kind = "tikfinity" as const;

  private sink: ProviderSink | null = null;
  private socket: WebSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private attempt = 0;
  private sequence = 0;
  private currentStatus: ProviderStatus = { kind: SOURCE, state: "idle" };

  private readonly now: () => number;
  private readonly minRetryMs: number;
  private readonly maxRetryMs: number;
  private readonly streaks: GiftStreakTracker;
  private readonly log: (message: string) => void;

  constructor(private readonly options: TikFinityProviderOptions) {
    if (!isLocalWebSocketUrl(options.url)) {
      throw new Error("URL do TikFinity deve ser ws://localhost:<porta>");
    }
    this.now = options.now ?? Date.now;
    this.minRetryMs = options.minRetryMs ?? DEFAULTS.minRetryMs;
    this.maxRetryMs = options.maxRetryMs ?? DEFAULTS.maxRetryMs;
    this.streaks = new GiftStreakTracker(options.streakTimeoutMs ?? DEFAULTS.streakTimeoutMs);
    this.log = options.log ?? (() => {});
  }

  start(sink: ProviderSink): void {
    if (this.sink) return;
    this.sink = sink;
    this.flushTimer = setInterval(() => this.emitGifts(this.streaks.flushExpired(this.now())), FLUSH_INTERVAL_MS);
    this.flushTimer.unref();
    this.connect();
  }

  stop(): void {
    if (!this.sink) return;
    // Presentes em sequência ainda abertos são entregues antes de o sink ser solto.
    this.emitGifts(this.streaks.flushAll());
    this.sink = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.attempt = 0;
    this.setStatus("idle");
  }

  status(): ProviderStatus {
    return this.currentStatus;
  }

  private connect(): void {
    const socket = new WebSocket(this.options.url, {
      handshakeTimeout: HANDSHAKE_TIMEOUT_MS,
      maxPayload: MAX_PAYLOAD_BYTES,
    });
    this.socket = socket;
    this.setStatus("disconnected", `conectando ao TikFinity em ${this.options.url}`);

    socket.on("open", () => {
      if (this.socket !== socket) return;
      this.attempt = 0;
      this.setStatus("connected", "recebendo eventos do TikFinity");
    });

    socket.on("message", (data: RawData) => {
      if (this.socket !== socket) return;
      this.handleText(toText(data));
    });

    socket.on("error", (error: Error) => {
      // O evento "close" acompanha todo erro; a reconexão é tratada ali.
      this.log(`TikFinity: ${error.message}`);
    });

    socket.on("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      const delay = this.scheduleRetry();
      if (delay !== null) {
        this.setStatus("disconnected", `TikFinity desconectado; nova tentativa em ${Math.ceil(delay / 1000)} s`);
      }
    });
  }

  /** Agenda a próxima tentativa. Retorna o atraso, ou null se o provedor já foi parado. */
  private scheduleRetry(): number | null {
    if (!this.sink) return null;
    const delay = nextBackoffMs(this.attempt, this.minRetryMs, this.maxRetryMs);
    this.attempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.sink) this.connect();
    }, delay);
    return delay;
  }

  private handleText(raw: string): void {
    const envelope = parseEnvelope(raw);
    if (!envelope) return;
    const { event, data } = envelope;

    switch (event) {
      case "chat":
        this.emitDraft(mapChat(data), "chat", readMsgId(data));
        return;
      case "like":
        this.emitDraft(mapLike(data), "like", undefined);
        return;
      case "gift": {
        const gift = readGift(data);
        if (!gift) return;
        this.emitGifts(this.streaks.observe(gift, this.now()));
        return;
      }
      default:
        // share, follow, roomUser, subscribe etc. não afetam o jogo.
        return;
    }
  }

  private emitDraft(draft: EventDraft | null, prefix: string, msgId: string | undefined): void {
    if (!draft) return;
    this.deliver(draft, this.makeId(prefix, msgId));
  }

  private emitGifts(completed: CompletedGift[]): void {
    for (const item of completed) {
      this.deliver(item.draft, this.makeId("gift", item.msgId));
    }
  }

  private deliver(draft: EventDraft, id: string): void {
    if (!this.sink) return;
    this.sink.onRawEvent({ ...draft, id, timestamp: this.now(), source: SOURCE });
  }

  /** Id estável quando a mensagem traz msgId (evita contar duas vezes); senão, sequencial. */
  private makeId(prefix: string, msgId: string | undefined): string {
    if (msgId) return `tf-${prefix}-${msgId}`;
    this.sequence += 1;
    return `tf-${prefix}-${this.now()}-${this.sequence}`;
  }

  private setStatus(state: ProviderState, detail?: string): void {
    this.currentStatus = detail === undefined ? { kind: SOURCE, state } : { kind: SOURCE, state, detail };
    this.sink?.onStatus(this.currentStatus);
  }
}

function toText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return data.toString("utf8");
}
