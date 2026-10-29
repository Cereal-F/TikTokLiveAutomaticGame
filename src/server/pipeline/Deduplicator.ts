/**
 * Descarta eventos com um identificador já visto dentro de uma janela de tempo.
 * Entradas expiradas são removidas ao longo do uso, e o tamanho é limitado.
 */
export class Deduplicator {
  /** id -> instante (ms) em que a entrada expira. A ordem de inserção é cronológica. */
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxSize: number,
    private readonly now: () => number,
  ) {
    if (ttlMs <= 0 || maxSize <= 0) throw new RangeError("ttlMs e maxSize devem ser positivos");
  }

  /** Retorna true se o id é novo (e o registra); false se é duplicado. */
  accept(id: string): boolean {
    const current = this.now();
    this.prune(current);

    const expiresAt = this.seen.get(id);
    if (expiresAt !== undefined && expiresAt > current) return false;

    // Reinserção move a chave para o fim, mantendo a ordem cronológica.
    this.seen.delete(id);
    this.seen.set(id, current + this.ttlMs);

    while (this.seen.size > this.maxSize) {
      const oldest = this.seen.keys().next().value;
      if (oldest === undefined) break;
      this.seen.delete(oldest);
    }
    return true;
  }

  get size(): number {
    return this.seen.size;
  }

  private prune(current: number): void {
    for (const [id, expiresAt] of this.seen) {
      if (expiresAt > current) break;
      this.seen.delete(id);
    }
  }
}
