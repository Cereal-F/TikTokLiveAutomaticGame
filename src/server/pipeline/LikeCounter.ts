import type { LiveEventSource } from "../../shared/events.js";

/** Quem aparece no lote de curtidas: o último espectador que curtiu na janela. */
export interface LikeSender {
  userId: string;
  userName: string;
  avatarUrl?: string;
}

/**
 * Acumula curtidas recebidas dentro de uma janela e as entrega de uma só vez.
 * Evita que centenas de curtidas virem centenas de eventos para o jogo.
 * Guarda também o último espectador, para a tela mostrar quem curtiu.
 */
export class LikeCounter {
  private pending = 0;
  private lastSource: LiveEventSource = "simulation";
  private lastSender: LikeSender | null = null;

  add(count: number, source: LiveEventSource, sender: LikeSender): void {
    if (!Number.isInteger(count) || count <= 0) return;
    this.pending += count;
    this.lastSource = source;
    this.lastSender = sender;
  }

  /** Retorna o total acumulado e zera o contador. */
  take(): { count: number; source: LiveEventSource; sender: LikeSender } | null {
    if (this.pending === 0 || !this.lastSender) return null;
    const result = { count: this.pending, source: this.lastSource, sender: this.lastSender };
    this.pending = 0;
    this.lastSender = null;
    return result;
  }

  get pendingCount(): number {
    return this.pending;
  }
}
