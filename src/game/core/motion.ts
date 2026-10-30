import type { Point } from "./targeting.js";

/**
 * Velocidade que se aproxima aos poucos da velocidade desejada, com aceleração limitada.
 * Mudanças bruscas de direção viram curvas suaves em vez de trepidação.
 * `desired` é um vetor unitário (ou zero); o resultado usa `maxSpeed` em px/s.
 */
export function approachVelocity(current: Point, desired: Point, maxSpeed: number, accel: number, dtMs: number): Point {
  const target = { x: desired.x * maxSpeed, y: desired.y * maxSpeed };
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const gap = Math.hypot(dx, dy);
  const maxStep = (accel * dtMs) / 1000;
  if (gap <= maxStep || gap < 1e-9) return target;
  return { x: current.x + (dx / gap) * maxStep, y: current.y + (dy / gap) * maxStep };
}
