export interface RateLimitRule {
  /** Quantidade máxima de fichas acumuladas (rajada permitida). */
  capacity: number;
  /** Fichas recuperadas por segundo. */
  refillPerSecond: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * Limitador por balde de fichas (token bucket), com uma chave por usuário ou por canal.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly rule: RateLimitRule,
    private readonly now: () => number,
    private readonly maxKeys = 10_000,
  ) {
    if (rule.capacity <= 0 || rule.refillPerSecond < 0) {
      throw new RangeError("regra de rate limit inválida");
    }
  }

  /** Consome uma ficha da chave. Retorna false quando o limite foi atingido. */
  tryConsume(key: string): boolean {
    const current = this.now();
    const existing = this.buckets.get(key);

    let tokens = this.rule.capacity;
    if (existing) {
      const elapsedSeconds = Math.max(0, current - existing.updatedAt) / 1000;
      tokens = Math.min(this.rule.capacity, existing.tokens + elapsedSeconds * this.rule.refillPerSecond);
    }

    const allowed = tokens >= 1;
    if (allowed) tokens -= 1;

    // Reinserção mantém a chave no fim para a remoção por idade funcionar.
    this.buckets.delete(key);
    this.buckets.set(key, { tokens, updatedAt: current });

    while (this.buckets.size > this.maxKeys) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
    return allowed;
  }
}
