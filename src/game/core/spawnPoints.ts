import type { Point } from "./targeting.js";

/**
 * Ponto de nascimento de um inimigo, fora da arena, em uma das quatro bordas.
 * `random` deve retornar valores em [0, 1).
 */
export function edgeSpawnPoint(random: () => number, world: { width: number; height: number }, margin = 24): Point {
  const side = Math.floor(random() * 4);
  const along = random();
  switch (side) {
    case 0:
      return { x: along * world.width, y: -margin };
    case 1:
      return { x: world.width + margin, y: along * world.height };
    case 2:
      return { x: along * world.width, y: world.height + margin };
    default:
      return { x: -margin, y: along * world.height };
  }
}
