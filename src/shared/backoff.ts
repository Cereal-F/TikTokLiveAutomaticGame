/** Atraso de reconexão: cresce exponencialmente a partir de `minMs` e é limitado por `maxMs`. */
export function nextBackoffMs(attempt: number, minMs: number, maxMs: number): number {
  const safeAttempt = Math.max(0, Math.min(attempt, 30));
  return Math.min(maxMs, minMs * 2 ** safeAttempt);
}
