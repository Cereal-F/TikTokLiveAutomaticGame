import type { LiveEvent, LiveEventKind } from "../../shared/events.js";
import { parseLiveEvent } from "../validation.js";
import { Deduplicator } from "./Deduplicator.js";
import { LikeCounter } from "./LikeCounter.js";
import { RateLimiter, type RateLimitRule } from "./RateLimiter.js";

export interface EventPipelineOptions {
  now: () => number;
  dedupeTtlMs: number;
  dedupeMaxSize: number;
  /** Limite por usuário para cada tipo de evento. */
  userRateLimits: Record<LiveEventKind, RateLimitRule>;
  /** Limite global de eventos aceitos, para proteger o jogo de rajadas. */
  globalRateLimit: RateLimitRule;
}

export type SubmitResult =
  | { accepted: true }
  | { accepted: false; reason: "invalid" | "duplicate" | "rate_limited"; detail: string };

export type EventSink = (event: LiveEvent) => void;

/**
 * Único ponto de entrada de eventos externos no servidor:
 * valida, deduplica, limita a frequência e agrega curtidas antes de emitir.
 */
export class EventPipeline {
  private readonly dedupe: Deduplicator;
  private readonly userLimiters: Record<LiveEventKind, RateLimiter>;
  private readonly globalLimiter: RateLimiter;
  private readonly likes = new LikeCounter();
  private batchSequence = 0;

  constructor(
    private readonly emit: EventSink,
    private readonly options: EventPipelineOptions,
  ) {
    this.dedupe = new Deduplicator(options.dedupeTtlMs, options.dedupeMaxSize, options.now);
    this.userLimiters = {
      like: new RateLimiter(options.userRateLimits.like, options.now),
      comment: new RateLimiter(options.userRateLimits.comment, options.now),
      gift: new RateLimiter(options.userRateLimits.gift, options.now),
    };
    this.globalLimiter = new RateLimiter(options.globalRateLimit, options.now);
  }

  submit(raw: unknown): SubmitResult {
    const parsed = parseLiveEvent(raw);
    if (!parsed.ok) return { accepted: false, reason: "invalid", detail: parsed.error };
    const event = parsed.value;

    if (!this.dedupe.accept(event.id)) {
      return { accepted: false, reason: "duplicate", detail: "evento já processado" };
    }
    // O limite do usuário vem antes do global: eventos bloqueados por ele não gastam o orçamento dos demais.
    if (!this.userLimiters[event.kind].tryConsume(event.userId)) {
      return { accepted: false, reason: "rate_limited", detail: "muitos eventos deste usuário" };
    }
    if (!this.globalLimiter.tryConsume("global")) {
      return { accepted: false, reason: "rate_limited", detail: "limite global de eventos atingido" };
    }

    if (event.kind === "like") {
      this.likes.add(event.count, event.source);
    } else {
      this.emit(event);
    }
    return { accepted: true };
  }

  /** Emite as curtidas acumuladas como um único evento agregado. Chamado em intervalos regulares. */
  flushLikes(): void {
    const batch = this.likes.take();
    if (!batch) return;
    this.batchSequence += 1;
    this.emit({
      id: `likes-batch-${this.batchSequence}`,
      kind: "like",
      userId: "audience",
      userName: "Plateia",
      timestamp: this.options.now(),
      source: batch.source,
      count: batch.count,
    });
  }

  get pendingLikes(): number {
    return this.likes.pendingCount;
  }
}
