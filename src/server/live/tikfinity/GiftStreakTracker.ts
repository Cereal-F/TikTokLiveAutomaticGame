import { giftDraft, type GiftDraft, type GiftObservation } from "./mapping.js";

/** Presente já decidido: pronto para virar um evento de presente. */
export interface CompletedGift {
  draft: GiftDraft;
  /** Só existe para presentes que não são sequência (eles têm mensagem própria e única). */
  msgId?: string;
}

interface PendingStreak {
  latest: GiftObservation;
  maxRepeat: number;
  lastSeenMs: number;
}

/**
 * Soma presentes em sequência (combo) em um único evento.
 *
 * Um presente em sequência chega como várias mensagens; cada uma traz o total acumulado.
 * Emitir cada uma estouraria o limite de taxa do pipeline e contaria o mesmo presente
 * várias vezes. Aqui só se emite quando a sequência termina (repeatEnd) ou, se o fim
 * nunca chegar, quando ficar `timeoutMs` sem novas mensagens.
 */
export class GiftStreakTracker {
  private readonly pending = new Map<string, PendingStreak>();

  constructor(private readonly timeoutMs: number) {
    if (!(timeoutMs > 0)) throw new RangeError("timeoutMs deve ser positivo");
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  /** Registra uma mensagem. Retorna os presentes concluídos por ela (no máximo um). */
  observe(gift: GiftObservation, nowMs: number): CompletedGift[] {
    if (!gift.streakable) {
      return [{ draft: giftDraft(gift, gift.repeatCount), msgId: gift.msgId }];
    }

    const key = `${gift.userId}|${gift.giftId}`;
    const previous = this.pending.get(key);
    const maxRepeat = Math.max(previous?.maxRepeat ?? 0, gift.repeatCount);

    if (gift.repeatEnd) {
      this.pending.delete(key);
      return [{ draft: giftDraft(gift, maxRepeat) }];
    }

    this.pending.set(key, { latest: gift, maxRepeat, lastSeenMs: nowMs });
    return [];
  }

  /** Conclui as sequências paradas há `timeoutMs` ou mais. */
  flushExpired(nowMs: number): CompletedGift[] {
    const done: CompletedGift[] = [];
    for (const [key, streak] of this.pending) {
      if (nowMs - streak.lastSeenMs >= this.timeoutMs) {
        this.pending.delete(key);
        done.push({ draft: giftDraft(streak.latest, streak.maxRepeat) });
      }
    }
    return done;
  }

  /** Conclui todas as sequências em aberto (usado ao parar o provedor). */
  flushAll(): CompletedGift[] {
    const done = [...this.pending.values()].map((streak) => ({
      draft: giftDraft(streak.latest, streak.maxRepeat),
    }));
    this.pending.clear();
    return done;
  }
}
