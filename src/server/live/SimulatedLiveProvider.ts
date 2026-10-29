import type { LiveEventKind } from "../../shared/events.js";
import { AUTO_INTERVAL_LIMITS, type ProviderState, type ProviderStatus } from "../../shared/protocol.js";
import type { LiveProvider, ProviderSink } from "./LiveProvider.js";

export interface SimulatedProviderOptions {
  random?: () => number;
  now?: () => number;
  newId?: () => string;
}

const SAMPLE_USERS = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Felipe", "Gabi", "Hugo", "Iris", "Julio"];
const SAMPLE_COMMENTS = ["Vai!", "Que jogo!", "Mais monstros!", "Cuidado atrás de você", "GG", "Bora sobreviver"];

/** Catálogo fictício de presentes, em ordem crescente de valor (um de cada faixa de poder). */
export const SIMULATED_GIFTS: readonly { name: string; diamonds: number }[] = [
  { name: "Rosa", diamonds: 1 },
  { name: "Coração", diamonds: 5 },
  { name: "Chapéu", diamonds: 20 },
  { name: "Leão", diamonds: 100 },
  { name: "Foguete", diamonds: 500 },
];

/** Probabilidade acumulada de cada presente no modo automático: presentes baratos são mais comuns. */
const AUTO_GIFT_CUMULATIVE = [0.5, 0.75, 0.9, 0.97, 1];

/**
 * Gera eventos fictícios para testar o jogo sem uma live real.
 * Os eventos são entregues como dados brutos, passando pela mesma validação de um conector real.
 */
export class SimulatedLiveProvider implements LiveProvider {
  readonly kind = "simulation" as const;

  private sink: ProviderSink | null = null;
  private state: ProviderState = "idle";
  private autoTimer: ReturnType<typeof setInterval> | null = null;
  private autoIntervalMs: number = AUTO_INTERVAL_LIMITS.defaultMs;
  private sequence = 0;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(options: SimulatedProviderOptions = {}) {
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? (() => globalThis.crypto.randomUUID());
  }

  start(sink: ProviderSink): void {
    this.sink = sink;
    this.state = "connected";
    sink.onStatus(this.status());
  }

  stop(): void {
    this.setAutoTimer(false);
    this.sink = null;
    this.state = "idle";
  }

  status(): ProviderStatus {
    const autoText = this.autoTimer ? "modo automático ligado" : "controle manual";
    return { kind: "simulation", state: this.state, detail: autoText };
  }

  get autoEnabled(): boolean {
    return this.autoTimer !== null;
  }

  get autoInterval(): number {
    return this.autoIntervalMs;
  }

  /**
   * Dispara `count` eventos do tipo indicado. Para presentes, `diamonds` escolhe a faixa
   * (do catálogo, quando houver um presente com esse valor). Retorna false se não iniciado.
   */
  trigger(kind: LiveEventKind, count = 1, diamonds?: number): boolean {
    if (!this.sink) return false;
    for (let i = 0; i < count; i += 1) {
      this.sink.onRawEvent(this.buildEvent(kind, diamonds));
    }
    return true;
  }

  /** Liga ou desliga o modo automático. Retorna false se o provedor não está iniciado. */
  setAuto(enabled: boolean, intervalMs?: number): boolean {
    if (!this.sink) return false;
    if (intervalMs !== undefined) this.autoIntervalMs = intervalMs;
    this.setAutoTimer(enabled);
    this.sink.onStatus(this.status());
    return true;
  }

  private setAutoTimer(enabled: boolean): void {
    if (this.autoTimer) {
      clearInterval(this.autoTimer);
      this.autoTimer = null;
    }
    if (enabled) {
      this.autoTimer = setInterval(() => this.tickAuto(), this.autoIntervalMs);
    }
  }

  private tickAuto(): void {
    const roll = this.random();
    const kind: LiveEventKind = roll < 0.6 ? "like" : roll < 0.9 ? "comment" : "gift";
    this.trigger(kind, 1);
  }

  private buildEvent(kind: LiveEventKind, diamonds?: number): Record<string, unknown> {
    this.sequence += 1;
    const userIndex = Math.floor(this.random() * SAMPLE_USERS.length);
    const userName = SAMPLE_USERS[userIndex] ?? "Espectador";
    const base = {
      id: `sim-${this.sequence}-${this.newId()}`,
      userId: `sim-user-${userIndex}`,
      userName,
      timestamp: this.now(),
      source: "simulation",
      kind,
    };

    if (kind === "like") {
      return { ...base, count: 1 + Math.floor(this.random() * 5) };
    }
    if (kind === "comment") {
      const text = SAMPLE_COMMENTS[Math.floor(this.random() * SAMPLE_COMMENTS.length)] ?? "Vai!";
      return { ...base, text };
    }
    const gift = diamonds === undefined ? this.randomGift() : this.giftWithValue(diamonds);
    return { ...base, giftName: gift.name, diamonds: gift.diamonds };
  }

  private randomGift(): { name: string; diamonds: number } {
    const roll = this.random();
    const index = AUTO_GIFT_CUMULATIVE.findIndex((limit) => roll < limit);
    return SIMULATED_GIFTS[index === -1 ? SIMULATED_GIFTS.length - 1 : index] ?? SIMULATED_GIFTS[0]!;
  }

  private giftWithValue(diamonds: number): { name: string; diamonds: number } {
    return SIMULATED_GIFTS.find((gift) => gift.diamonds === diamonds) ?? { name: `Presente ${diamonds}`, diamonds };
  }
}
