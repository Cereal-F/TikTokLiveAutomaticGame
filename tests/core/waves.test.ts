import { describe, expect, it } from "vitest";
import { WAVES } from "../../src/game/core/constants.js";
import { killPoints, waveConfig } from "../../src/game/core/waves.js";

describe("waveConfig", () => {
  it("usa valores iniciais na onda 1", () => {
    expect(waveConfig(1)).toEqual({ wave: 1, enemyCount: 6, spawnIntervalMs: 1000, enemyHp: 2, enemySpeed: 60 });
  });

  it("aumenta a dificuldade na onda 2", () => {
    expect(waveConfig(2)).toEqual({ wave: 2, enemyCount: 10, spawnIntervalMs: 955, enemyHp: 3, enemySpeed: 68 });
  });

  it("trata ondas inválidas (zero, negativas) como a onda 1", () => {
    expect(waveConfig(0).wave).toBe(1);
    expect(waveConfig(-5).wave).toBe(1);
    expect(waveConfig(0).enemyCount).toBe(6);
  });

  it("respeita os limites máximos em ondas altas", () => {
    const late = waveConfig(100);
    expect(late.enemyCount).toBe(WAVES.maxEnemiesPerWave);
    expect(late.spawnIntervalMs).toBe(WAVES.minSpawnIntervalMs);
    expect(late.enemyHp).toBe(30);
    expect(late.enemySpeed).toBe(170);
  });

  it("nunca diminui a dificuldade de uma onda para a seguinte", () => {
    for (let wave = 1; wave < 100; wave += 1) {
      const current = waveConfig(wave);
      const next = waveConfig(wave + 1);
      expect(next.enemyCount).toBeGreaterThanOrEqual(current.enemyCount);
      expect(next.enemyHp).toBeGreaterThanOrEqual(current.enemyHp);
      expect(next.enemySpeed).toBeGreaterThanOrEqual(current.enemySpeed);
      expect(next.spawnIntervalMs).toBeLessThanOrEqual(current.spawnIntervalMs);
    }
  });
});

describe("killPoints", () => {
  it("concede 10 pontos na onda 1 e sobe 2 por onda", () => {
    expect(killPoints(1)).toBe(10);
    expect(killPoints(3)).toBe(14);
    expect(killPoints(0)).toBe(10);
  });
});
