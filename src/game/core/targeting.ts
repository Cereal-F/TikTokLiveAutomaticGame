export interface Point {
  x: number;
  y: number;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Retorna o item mais próximo de `origin` dentro de `range`, ou null se nenhum estiver ao alcance. */
export function findNearest<T extends Point>(origin: Point, items: readonly T[], range: number): T | null {
  let best: T | null = null;
  let bestDistance = range;
  for (const item of items) {
    const d = distance(origin, item);
    if (d <= bestDistance) {
      best = item;
      bestDistance = d;
    }
  }
  return best;
}

/** Vetor unitário de `from` até `to`. Retorna (0, 0) quando os pontos coincidem. */
export function directionTo(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: 0, y: 0 };
  return { x: dx / length, y: dy / length };
}
