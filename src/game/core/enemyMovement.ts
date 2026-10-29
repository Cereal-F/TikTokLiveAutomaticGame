import { ENEMY } from "./constants.js";
import { directionTo, distance, type Point } from "./targeting.js";

export interface SeparationRule {
  radius: number;
  weight: number;
}

const DEFAULT_SEPARATION: SeparationRule = {
  radius: ENEMY.separationRadius,
  weight: ENEMY.separationWeight,
};

/**
 * Direção de um inimigo que persegue um alvo, com repulsão dos vizinhos próximos.
 * Sem a repulsão, todos os inimigos convergem para o mesmo ponto e formam um bloco
 * que o personagem circula sem parar. Com ela, eles se espalham e chegam de vários lados.
 * Retorna um vetor unitário (ou zero se já estiver sobre o alvo sem vizinhos).
 */
export function chaseDirection(
  self: Point,
  target: Point,
  others: readonly Point[],
  rule: SeparationRule = DEFAULT_SEPARATION,
): Point {
  const toward = directionTo(self, target);
  let pushX = 0;
  let pushY = 0;
  for (const other of others) {
    const d = distance(self, other);
    if (d <= 0 || d >= rule.radius) continue;
    const away = directionTo(other, self);
    const weight = (rule.radius - d) / rule.radius;
    pushX += away.x * weight;
    pushY += away.y * weight;
  }

  const x = toward.x + pushX * rule.weight;
  const y = toward.y + pushY * rule.weight;
  const length = Math.hypot(x, y);
  if (length < 1e-9) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
}
