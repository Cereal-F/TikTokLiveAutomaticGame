import type { BossAttack, BossDesign } from "./bosses.js";
import { ENEMY_TYPES } from "./constants.js";
import { chaseDirection } from "./enemyMovement.js";
import { directionTo, distance, type Point } from "./targeting.js";

/**
 * Comportamentos dos inimigos e dos chefes. Cada "cérebro" decide a direção e a
 * velocidade do próximo passo e, quando for o caso, os tiros. Não sabe nada de Phaser.
 */

/** Intenção de movimento de um inimigo neste quadro. */
export interface Intent {
  /** Vetor unitário (ou zero). */
  direction: Point;
  /** Multiplicador da velocidade base do inimigo. */
  speedFactor: number;
}

/** Um disparo: vários tiros saindo do mesmo ponto. */
export interface Volley {
  directions: Point[];
  speed: number;
  damage: number;
}

const SHOOTER = ENEMY_TYPES.shooter;
const CHARGER = ENEMY_TYPES.charger;
/** Abertura total do leque dos padrões "aimed". */
const AIM_SPREAD = 0.5;
/** Quanto o anel gira a cada disparo do padrão "spiral". */
const SPIRAL_STEP = 0.35;
/** Duração e velocidade da arrancada do chefe. */
const BOSS_CHARGE_MS = 900;
const BOSS_CHARGE_SPEED_FACTOR = 3.5;

function negate(v: Point): Point {
  return { x: -v.x, y: -v.y };
}

/** Gira um vetor pelo ângulo dado (radianos). */
export function rotate(v: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

/**
 * Desvios de mira dos tiros do atirador, em ciclo. Alguns tiros passam longe do personagem,
 * então ele não é atingido sempre que o atirador dispara: dá para se mover e escapar.
 */
const AIM_OFFSETS: readonly number[] = [0, 0.1, -0.1, 0.22, -0.22];

/**
 * Atirador: aproxima-se até a distância ideal, recua se ficar perto demais e, na faixa ideal,
 * fica quase parado mirando (sem dar voltas no personagem). Dispara a cada intervalo, com desvio de mira.
 */
export class ShooterBrain {
  private cooldownMs = SHOOTER.fireIntervalMs / 2;
  private shotCount = 0;

  step(self: Point, target: Point, others: readonly Point[], dtMs: number): Intent & { fire: boolean; aim: number } {
    const d = distance(self, target);
    const toward = chaseDirection(self, target, others);

    let direction: Point;
    let speedFactor: number;
    if (d > SHOOTER.preferredDistance + 40) {
      direction = toward;
      speedFactor = 1;
    } else if (d < SHOOTER.tooCloseDistance) {
      direction = negate(toward);
      speedFactor = 1;
    } else {
      direction = toward;
      speedFactor = 0.15;
    }

    this.cooldownMs -= dtMs;
    let fire = false;
    let aim = 0;
    if (this.cooldownMs <= 0 && d <= SHOOTER.fireRangeDistance) {
      fire = true;
      aim = AIM_OFFSETS[this.shotCount % AIM_OFFSETS.length] ?? 0;
      this.shotCount += 1;
      this.cooldownMs = SHOOTER.fireIntervalMs;
    }
    return { direction, speedFactor, fire, aim };
  }
}

/** Saltador: aproxima-se devagar e, a cada ciclo, arranca em linha reta na direção do personagem. */
export class ChargerBrain {
  private charging = false;
  private timerMs: number = CHARGER.approachMs;
  private chargeDirection: Point = { x: 0, y: 0 };

  step(self: Point, target: Point, others: readonly Point[], dtMs: number): Intent {
    this.timerMs -= dtMs;
    if (!this.charging) {
      if (this.timerMs <= 0) {
        this.charging = true;
        this.timerMs = CHARGER.chargeMs;
        this.chargeDirection = directionTo(self, target);
      }
      return { direction: chaseDirection(self, target, others), speedFactor: CHARGER.approachSpeedFactor };
    }

    if (this.timerMs <= 0) {
      this.charging = false;
      this.timerMs = CHARGER.approachMs;
      return { direction: chaseDirection(self, target, others), speedFactor: CHARGER.approachSpeedFactor };
    }
    return { direction: this.chargeDirection, speedFactor: CHARGER.chargeSpeedFactor };
  }
}

/** Direções dos tiros de um padrão de chefe, a partir de `self` em direção a `target`. */
export function patternDirections(attack: BossAttack, self: Point, target: Point, phase: number): Point[] {
  if (attack.kind === "aimed") {
    const aim = directionTo(self, target);
    const base = Math.atan2(aim.y, aim.x);
    if (attack.count <= 1) return [aim];
    return Array.from({ length: attack.count }, (_, i) => {
      const angle = base + (i / (attack.count - 1) - 0.5) * AIM_SPREAD;
      return { x: Math.cos(angle), y: Math.sin(angle) };
    });
  }
  // ring e spiral: anel completo; o spiral recebe uma fase que gira a cada disparo.
  return Array.from({ length: attack.count }, (_, i) => {
    const angle = phase + (i * Math.PI * 2) / attack.count;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  });
}

/** Chefe: persegue o personagem, arranca de tempos em tempos e dispara os padrões do seu desenho. */
export class BossBrain {
  private readonly attackTimers: number[];
  private readonly phases: number[];
  private chargeTimerMs: number | null;
  private chargeLeftMs = 0;
  private chargeDirection: Point = { x: 0, y: 0 };

  constructor(private readonly design: BossDesign) {
    this.attackTimers = design.attacks.map((attack) => attack.intervalMs);
    this.phases = design.attacks.map(() => 0);
    this.chargeTimerMs = design.chargeIntervalMs;
  }

  step(self: Point, target: Point, others: readonly Point[], dtMs: number): Intent & { volleys: Volley[] } {
    // A arrancada começa no mesmo quadro em que o intervalo termina.
    if (this.chargeTimerMs !== null) {
      this.chargeTimerMs -= dtMs;
      if (this.chargeTimerMs <= 0 && this.chargeLeftMs <= 0) {
        this.chargeTimerMs = this.design.chargeIntervalMs;
        this.chargeLeftMs = BOSS_CHARGE_MS;
        this.chargeDirection = directionTo(self, target);
      }
    }

    let direction: Point;
    let speedFactor: number;
    if (this.chargeLeftMs > 0) {
      this.chargeLeftMs -= dtMs;
      direction = this.chargeDirection;
      speedFactor = BOSS_CHARGE_SPEED_FACTOR;
    } else {
      direction = chaseDirection(self, target, others);
      speedFactor = 1;
    }

    const volleys: Volley[] = [];
    this.design.attacks.forEach((attack, i) => {
      this.attackTimers[i]! -= dtMs;
      if (this.attackTimers[i]! > 0) return;
      this.attackTimers[i] = attack.intervalMs;
      volleys.push({
        directions: patternDirections(attack, self, target, this.phases[i]!),
        speed: attack.shotSpeed,
        damage: attack.damage,
      });
      this.phases[i] = this.phases[i]! + SPIRAL_STEP;
    });
    return { direction, speedFactor, volleys };
  }
}
