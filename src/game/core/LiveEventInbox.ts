import type { LiveEvent } from "../../shared/events.js";

/**
 * Fila de eventos recebidos do servidor, drenada pela cena a cada quadro.
 * Limitada: se o jogo travar ou a rede enviar rajadas, descarta os mais antigos
 * em vez de crescer sem controle.
 */
export class LiveEventInbox {
  private readonly queue: LiveEvent[] = [];
  private droppedCount = 0;

  constructor(private readonly capacity: number = 200) {
    if (capacity <= 0) throw new RangeError("capacidade deve ser positiva");
  }

  push(event: LiveEvent): void {
    this.queue.push(event);
    while (this.queue.length > this.capacity) {
      this.queue.shift();
      this.droppedCount += 1;
    }
  }

  /** Remove e retorna todos os eventos pendentes, na ordem de chegada. */
  drain(): LiveEvent[] {
    return this.queue.splice(0, this.queue.length);
  }

  get pending(): number {
    return this.queue.length;
  }

  get dropped(): number {
    return this.droppedCount;
  }
}
