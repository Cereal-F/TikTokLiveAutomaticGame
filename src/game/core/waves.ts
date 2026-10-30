import { bossDesignFor, bossNumberForWave, type BossDesign } from "./bosses.js";
import { BOSS, CAMPAIGN, ENEMY, ENEMY_TYPES, WAVES } from "./constants.js";

/** Tipos de inimigo comum. "virus" é o inimigo básico que persegue o personagem. */
export type EnemyKind = "virus" | "shooter" | "charger" | "tank";

/** Um tipo novo a cada capítulo (5 ondas): as ondas 6, 11 e 16 trocam o tipo. */
export const KIND_BY_CHAPTER: readonly EnemyKind[] = ["virus", "shooter", "charger", "tank"];

export interface BossConfig {
  hp: number;
  speed: number;
  radius: number;
  contactDamage: number;
  design: BossDesign;
}

export interface WaveConfig {
  wave: number;
  /** Total de inimigos da onda, contando o chefe quando houver. */
  enemyCount: number;
  spawnIntervalMs: number;
  /** Vida e velocidade dos inimigos comuns desta onda (já com o fator do tipo). */
  enemyHp: number;
  enemySpeed: number;
  kind: EnemyKind;
  /** Ondas múltiplas de BOSS.every trazem um chefe, que aparece primeiro. */
  isBoss: boolean;
  /** A última onda da campanha: derrotar o chefe dela vence a partida. */
  isFinal: boolean;
  boss: BossConfig | null;
}

/** Verdadeiro nas ondas 5, 10, 15 e 20 (a 20 é o chefe final). */
export function isBossWave(wave: number): boolean {
  const index = Math.max(1, Math.floor(wave));
  return index % BOSS.every === 0;
}

export function isFinalWave(wave: number): boolean {
  return Math.floor(wave) === CAMPAIGN.levels;
}

/** Tipo de inimigo comum da onda. Acima da última fase, repete o último tipo. */
export function enemyKindForWave(wave: number): EnemyKind {
  const index = Math.max(1, Math.floor(wave)) - 1;
  const chapter = Math.floor(index / CAMPAIGN.chapterLength);
  return KIND_BY_CHAPTER[Math.min(KIND_BY_CHAPTER.length - 1, chapter)]!;
}

/** Corpo visual e de contato de um inimigo comum, conforme o tipo. */
export interface CommonBody {
  texture: string;
  radius: number;
  contactDamage: number;
}

export function commonBodyFor(kind: EnemyKind): CommonBody {
  switch (kind) {
    case "virus":
      return { texture: "monster", radius: ENEMY.radius, contactDamage: ENEMY.contactDamage };
    case "shooter":
      return { texture: "shooter", radius: ENEMY_TYPES.shooter.radius, contactDamage: ENEMY_TYPES.shooter.contactDamage };
    case "charger":
      return { texture: "charger", radius: ENEMY_TYPES.charger.radius, contactDamage: ENEMY_TYPES.charger.contactDamage };
    case "tank":
      return { texture: "tank", radius: ENEMY_TYPES.tank.radius, contactDamage: ENEMY_TYPES.tank.contactDamage };
  }
}

/** Atributos do chefe da onda. Cada chefe (5, 10, 15, 20) tem um desenho e padrões próprios. */
export function bossConfig(wave: number): BossConfig {
  const design = bossDesignFor(bossNumberForWave(wave));
  return {
    hp: design.hp,
    speed: design.speed,
    radius: design.radius,
    contactDamage: design.contactDamage,
    design,
  };
}

/**
 * Parâmetros de cada onda. A dificuldade cresce a cada onda e o tipo de inimigo muda a cada capítulo.
 */
export function waveConfig(wave: number): WaveConfig {
  const index = Math.max(0, Math.floor(wave) - 1);
  const isBoss = isBossWave(index + 1);
  const kind = enemyKindForWave(index + 1);
  const hpFactor = kind === "virus" ? 1 : ENEMY_TYPES[kind].hpFactor;
  const speedFactor = kind === "virus" ? 1 : ENEMY_TYPES[kind].speedFactor;
  // O chefe conta no total, então a escolta é reduzida em um para respeitar o máximo.
  const cap = WAVES.maxEnemiesPerWave - (isBoss ? 1 : 0);
  const baseEscorts = Math.min(cap, 8 + index * 5);
  // Atiradores em grupo viram chuva de tiros: a escolta deles tem teto próprio.
  const escorts = kind === "shooter" ? Math.min(baseEscorts, ENEMY_TYPES.shooter.maxPerWave) : baseEscorts;
  const baseHp = Math.min(40, 3 + Math.floor(index * 1.5));
  const baseSpeed = Math.min(260, 96 + index * 10);
  return {
    wave: index + 1,
    enemyCount: isBoss ? escorts + 1 : escorts,
    spawnIntervalMs: Math.max(WAVES.minSpawnIntervalMs, 700 - index * 70),
    enemyHp: Math.max(1, Math.round(baseHp * hpFactor)),
    enemySpeed: Math.round(baseSpeed * speedFactor),
    kind,
    isBoss,
    isFinal: isFinalWave(index + 1),
    boss: isBoss ? bossConfig(index + 1) : null,
  };
}

/** Pontos concedidos por inimigo derrotado; sobe levemente com a onda. */
export function killPoints(wave: number): number {
  return 10 + Math.max(0, Math.floor(wave) - 1) * 2;
}

export interface UpcomingWave {
  wave: number;
  isBoss: boolean;
}

/** As próximas `count` ondas a partir de `fromWave` (inclusive), com a marcação de chefe. */
export function upcomingWaves(fromWave: number, count: number): UpcomingWave[] {
  const start = Math.max(1, Math.floor(fromWave));
  return Array.from({ length: Math.max(0, count) }, (_, i) => ({
    wave: start + i,
    isBoss: isBossWave(start + i),
  }));
}
