import { BOSS, WAVES } from "./constants.js";

export interface BossConfig {
  hp: number;
  speed: number;
  radius: number;
  contactDamage: number;
}

export interface WaveConfig {
  wave: number;
  /** Total de inimigos da onda, contando o chefe quando houver. */
  enemyCount: number;
  spawnIntervalMs: number;
  enemyHp: number;
  enemySpeed: number;
  /** Ondas múltiplas de BOSS.every trazem um chefe, que aparece primeiro. */
  isBoss: boolean;
  boss: BossConfig | null;
}

/** Verdadeiro nas ondas 5, 10, 15... */
export function isBossWave(wave: number): boolean {
  const index = Math.max(1, Math.floor(wave));
  return index % BOSS.every === 0;
}

/** Atributos do chefe da onda (o n-ésimo chefe fica mais forte que o anterior). */
export function bossConfig(wave: number): BossConfig {
  const bossIndex = Math.max(0, Math.floor(Math.max(1, Math.floor(wave)) / BOSS.every) - 1);
  return {
    hp: BOSS.hpBase + bossIndex * BOSS.hpPerBoss,
    speed: Math.min(BOSS.speedMax, BOSS.speed + bossIndex * BOSS.speedPerBoss),
    radius: BOSS.radius,
    contactDamage: BOSS.contactDamage,
  };
}

/**
 * Parâmetros de cada onda. A dificuldade cresce a cada onda e tem limites,
 * para que a partida continue jogável em ondas altas.
 */
export function waveConfig(wave: number): WaveConfig {
  const index = Math.max(0, Math.floor(wave) - 1);
  const isBoss = isBossWave(index + 1);
  // O chefe conta no total, então a escolta é reduzida em um para respeitar o máximo.
  const cap = WAVES.maxEnemiesPerWave - (isBoss ? 1 : 0);
  const escorts = Math.min(cap, 8 + index * 5);
  return {
    wave: index + 1,
    enemyCount: isBoss ? escorts + 1 : escorts,
    spawnIntervalMs: Math.max(WAVES.minSpawnIntervalMs, 700 - index * 70),
    enemyHp: Math.min(40, 3 + Math.floor(index * 1.5)),
    enemySpeed: Math.min(260, 96 + index * 10),
    isBoss,
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
