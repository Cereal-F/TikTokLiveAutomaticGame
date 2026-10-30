import { BOSS } from "./constants.js";

/** Padrões de tiro dos chefes. */
export type BossPatternKind = "aimed" | "ring" | "spiral";

export interface BossAttack {
  /** aimed: leque em direção ao personagem; ring: anel completo; spiral: anel que gira a cada disparo. */
  kind: BossPatternKind;
  intervalMs: number;
  /** Quantidade de tiros por disparo. */
  count: number;
  damage: number;
  /** Velocidade do tiro em px/s. */
  shotSpeed: number;
}

export interface BossDesign {
  name: string;
  /** Textura do chefe no Phaser. */
  texture: "boss" | "boss2" | "boss3" | "bossFinal";
  radius: number;
  hp: number;
  speed: number;
  contactDamage: number;
  attacks: readonly BossAttack[];
  /** Intervalo entre arrancadas do chefe; null = o chefe não arranca. */
  chargeIntervalMs: number | null;
}

/** Quatro chefes distintos: um a cada 5 ondas. O último é o chefe final, grande e coroado. */
export const BOSS_DESIGNS: readonly BossDesign[] = [
  {
    name: "REI DOS VÍRUS",
    texture: "boss",
    radius: 26,
    hp: 80,
    speed: 70,
    contactDamage: 14,
    attacks: [{ kind: "aimed", intervalMs: 2_500, count: 3, damage: 6, shotSpeed: 260 }],
    chargeIntervalMs: 4_000,
  },
  {
    name: "ESPIRAL",
    texture: "boss2",
    radius: 28,
    hp: 120,
    speed: 60,
    contactDamage: 20,
    attacks: [{ kind: "spiral", intervalMs: 1_800, count: 8, damage: 5, shotSpeed: 220 }],
    chargeIntervalMs: null,
  },
  {
    name: "INVOCADOR",
    texture: "boss3",
    radius: 30,
    hp: 170,
    speed: 80,
    contactDamage: 22,
    attacks: [
      { kind: "aimed", intervalMs: 1_500, count: 5, damage: 6, shotSpeed: 280 },
      { kind: "ring", intervalMs: 5_000, count: 12, damage: 5, shotSpeed: 200 },
    ],
    chargeIntervalMs: null,
  },
  {
    name: "REI COROADO",
    texture: "bossFinal",
    radius: 52,
    hp: 360,
    speed: 90,
    contactDamage: 28,
    attacks: [
      { kind: "spiral", intervalMs: 1_200, count: 12, damage: 6, shotSpeed: 240 },
      { kind: "ring", intervalMs: 4_000, count: 16, damage: 7, shotSpeed: 200 },
    ],
    chargeIntervalMs: 3_500,
  },
];

/** Chefe pelo número do chefe (1 = primeiro chefe, na onda 5). Acima do último, repete o último. */
export function bossDesignFor(bossNumber: number): BossDesign {
  const index = Math.min(BOSS_DESIGNS.length, Math.max(1, Math.floor(bossNumber))) - 1;
  return BOSS_DESIGNS[index]!;
}

/** Número de chefes já até a onda (onda 5 = chefe 1). */
export function bossNumberForWave(wave: number): number {
  return Math.max(1, Math.floor(Math.max(1, Math.floor(wave)) / BOSS.every));
}
