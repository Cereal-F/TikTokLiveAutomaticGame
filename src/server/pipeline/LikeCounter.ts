import type { LiveEventSource } from "../../shared/events.js";

/**
 * Acumula curtidas recebidas dentro de uma janela e as entrega de uma só vez.
 * Evita que centenas de curtidas virem centenas de eventos para o jogo.
 */
export class LikeCounter {
  private pending = 0;
  private lastSource: LiveEventSource = "simulation";

  add(count: number, source: LiveEventSource): void {
    if (!Number.isInteger(count) || count <= 0) return;
    this.pending += count;
    this.lastSource = source;
  }

  /** Retorna o total acumulado e zera o contador. */
  take(): { count: number; source: LiveEventSource } | null {
    if (this.pending === 0) return null;
    const result = { count: this.pending, source: this.lastSource };
    this.pending = 0;
    return result;
  }

  get pendingCount(): number {
    return this.pending;
  }
}
