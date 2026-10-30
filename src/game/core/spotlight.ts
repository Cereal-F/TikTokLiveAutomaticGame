/**
 * Avisos no meio da tela: quem enviou um presente ou curtiu, o que enviou e o efeito que ganhou.
 * A fila mostra um aviso de cada vez; curtidas seguidas viram um só aviso.
 */

export const SPOTLIGHT = {
  giftMs: 2_600,
  likeMs: 1_600,
  maxQueued: 4,
} as const;

export interface Spotlight {
  kind: "gift" | "like";
  userId: string;
  userName: string;
  avatarUrl?: string;
  /** Linha principal: "20x Rosa" ou "+12 curtidas". */
  title: string;
  /** Efeito recebido: "+160 s de TURBO", "Cura +2" ou vazio. */
  effect: string;
  /** Nível do presente (1 a 4), ou 0 para curtidas. Define a cor. */
  tier: number;
  /** Quantidade: unidades do presente, ou curtidas agregadas. */
  count: number;
}

export function likeTitle(count: number): string {
  return count === 1 ? "+1 curtida" : `+${count} curtidas`;
}

function durationFor(item: Spotlight): number {
  return item.kind === "gift" ? SPOTLIGHT.giftMs : SPOTLIGHT.likeMs;
}

/** Junta duas curtidas seguidas: soma as quantidades e mostra o espectador mais recente. */
function mergeLikes(first: Spotlight, next: Spotlight): Spotlight {
  const count = first.count + next.count;
  return {
    ...next,
    count,
    title: likeTitle(count),
    effect: next.effect || first.effect,
  };
}

export class SpotlightQueue {
  private readonly queue: Spotlight[] = [];
  private active: { item: Spotlight; startedAt: number } | null = null;

  get pendingCount(): number {
    return this.queue.length;
  }

  push(item: Spotlight): void {
    const tail = this.queue[this.queue.length - 1];
    if (item.kind === "like" && tail?.kind === "like") {
      this.queue[this.queue.length - 1] = mergeLikes(tail, item);
      return;
    }
    // Se a fila estiver cheia, descarta o aviso mais antigo: o público quer ver quem acabou de chegar.
    if (this.queue.length >= SPOTLIGHT.maxQueued) this.queue.shift();
    this.queue.push(item);
  }

  /** Aviso que deve aparecer em `now`, ou null. Passa ao próximo quando o atual termina. */
  tick(now: number): Spotlight | null {
    if (this.active && now - this.active.startedAt < durationFor(this.active.item)) return this.active.item;
    const next = this.queue.shift() ?? null;
    this.active = next ? { item: next, startedAt: now } : null;
    return next;
  }
}
