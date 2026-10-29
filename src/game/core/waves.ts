import { WAVES } from "./constants.js";

export interface WaveConfig {
  wave: number;
  enemyCount: number;
  spawnIntervalMs: number;
  enemyHp: number;
  enemySpeed: number;
}

/**
 * Parâmetros de cada onda. A dificuldade cresce a cada onda e tem limites,
 * para que a partida continue jogável em ondas altas.
 */
export function waveConfig(wave: number): WaveConfig {
  const index = Math.max(0, Math.floor(wave) - 1);
  return {
    wave: index + 1,
    enemyCount: Math.min(WAVES.maxEnemiesPerWave, 6 + index * 4),
    spawnIntervalMs: Math.max(WAVES.minSpawnIntervalMs, 1_000 - index * 45),
    enemyHp: Math.min(30, 2 + Math.floor(index * 1.2)),
    enemySpeed: Math.min(170, 60 + index * 8),
  };
}

/** Pontos concedidos por inimigo derrotado; sobe levemente com a onda. */
export function killPoints(wave: number): number {
  return 10 + Math.max(0, Math.floor(wave) - 1) * 2;
}
