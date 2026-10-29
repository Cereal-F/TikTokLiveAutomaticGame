import { AUTOPILOT } from "./constants.js";
import { directionTo, distance, findNearest, type Point } from "./targeting.js";

export interface AutopilotView {
  position: Point;
  enemies: readonly Point[];
  world: { width: number; height: number };
}

function normalize(v: Point): Point {
  const length = Math.hypot(v.x, v.y);
  if (length < 1e-9) return { x: 0, y: 0 };
  return { x: v.x / length, y: v.y / length };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Empurrão para dentro quando o personagem está perto de uma borda (0 a 1 por eixo). */
function edgePush(p: Point, world: { width: number; height: number }): Point {
  const m = AUTOPILOT.edgeMargin;
  let x = 0;
  let y = 0;
  if (p.x < m) x += (m - p.x) / m;
  else if (p.x > world.width - m) x -= (p.x - (world.width - m)) / m;
  if (p.y < m) y += (m - p.y) / m;
  else if (p.y > world.height - m) y -= (p.y - (world.height - m)) / m;
  return { x, y };
}

/**
 * Piloto automático do personagem. Decide a direção sozinho, sem entrada do jogador:
 * foge quando um inimigo está muito perto, circula o inimigo mais próximo dentro do
 * alcance de ataque, aproxima-se quando ele está longe, e vagueia quando não há inimigos.
 * Sempre se afasta das bordas. Retorna um vetor unitário (ou zero).
 */
export class Autopilot {
  private waypoint: Point | null = null;

  constructor(private readonly random: () => number = Math.random) {}

  reset(): void {
    this.waypoint = null;
  }

  steer(view: AutopilotView): Point {
    const { position: p, enemies, world } = view;
    const intent = this.enemyIntent(p, enemies) ?? this.wander(p, world);
    const edge = edgePush(p, world);
    return normalize({
      x: intent.x + edge.x * AUTOPILOT.edgePushWeight,
      y: intent.y + edge.y * AUTOPILOT.edgePushWeight,
    });
  }

  private enemyIntent(p: Point, enemies: readonly Point[]): Point | null {
    const nearest = findNearest(p, enemies, Number.POSITIVE_INFINITY);
    if (!nearest) return null;

    const d = distance(p, nearest);
    const toward = directionTo(p, nearest);

    if (d < AUTOPILOT.fleeDistance) {
      // Foge da soma dos afastamentos de todos os inimigos próximos.
      let fx = 0;
      let fy = 0;
      for (const enemy of enemies) {
        const de = distance(p, enemy);
        if (de <= 0 || de >= AUTOPILOT.dangerRadius) continue;
        const weight = (AUTOPILOT.dangerRadius - de) / AUTOPILOT.dangerRadius;
        const away = directionTo(enemy, p);
        fx += away.x * weight;
        fy += away.y * weight;
      }
      if (fx !== 0 || fy !== 0) return normalize({ x: fx, y: fy });
      return { x: -toward.x, y: -toward.y };
    }

    if (d < AUTOPILOT.orbitDistance) {
      // Circula o inimigo, ajustando a distância para ficar perto da faixa média.
      const mid = (AUTOPILOT.fleeDistance + AUTOPILOT.orbitDistance) / 2;
      const half = (AUTOPILOT.orbitDistance - AUTOPILOT.fleeDistance) / 2;
      const radial = clamp((d - mid) / half, -1, 1) * 0.6;
      const perpendicular = { x: -toward.y, y: toward.x };
      return normalize({
        x: perpendicular.x + toward.x * radial,
        y: perpendicular.y + toward.y * radial,
      });
    }

    return toward;
  }

  private wander(p: Point, world: { width: number; height: number }): Point {
    if (!this.waypoint || distance(p, this.waypoint) < AUTOPILOT.waypointReachedDistance) {
      this.waypoint = this.randomWaypoint(world);
    }
    return directionTo(p, this.waypoint);
  }

  private randomWaypoint(world: { width: number; height: number }): Point {
    const inset = AUTOPILOT.wanderInset;
    return {
      x: inset + this.random() * (world.width - 2 * inset),
      y: inset + this.random() * (world.height - 2 * inset),
    };
  }
}
