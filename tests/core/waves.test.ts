import { describe, expect, it } from "vitest";
import { BOSS, WAVES } from "../../src/game/core/constants.js";
import { bossConfig, isBossWave, killPoints, upcomingWaves, waveConfig } from "../../src/game/core/waves.js";

describe("waveConfig", () => {
  it("usa valores iniciais na onda 1, sem chefe", () => {
    expect(waveConfig(1)).toEqual({
      wave: 1,
      enemyCount: 8,
      spawnIntervalMs: 700,
      enemyHp: 3,
      enemySpeed: 96,
      isBoss: false,
      boss: null,
    });
  });

  it("aumenta a dificuldade na onda 2", () => {
    expect(waveConfig(2)).toMatchObject({ enemyCount: 13, spawnIntervalMs: 630, enemyHp: 4, enemySpeed: 106 });
  });

  it("trata ondas inválidas (zero, negativas) como a onda 1", () => {
    expect(waveConfig(0).wave).toBe(1);
    expect(waveConfig(-5).wave).toBe(1);
    expect(waveConfig(0).enemyCount).toBe(8);
  });

  it("respeita os limites máximos em ondas altas, inclusive numa onda de chefe", () => {
    const late = waveConfig(101);
    expect(late.enemyCount).toBe(WAVES.maxEnemiesPerWave);
    expect(late.spawnIntervalMs).toBe(WAVES.minSpawnIntervalMs);
    expect(late.enemyHp).toBe(40);
    expect(late.enemySpeed).toBe(260);

    const bossWave = waveConfig(100);
    expect(bossWave.isBoss).toBe(true);
    expect(bossWave.enemyCount).toBeLessThanOrEqual(WAVES.maxEnemiesPerWave);
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

describe("chefes", () => {
  it("há chefe a cada BOSS.every ondas, e só nelas", () => {
    expect(isBossWave(4)).toBe(false);
    expect(isBossWave(5)).toBe(true);
    expect(isBossWave(6)).toBe(false);
    expect(isBossWave(10)).toBe(true);
    expect(isBossWave(15)).toBe(true);
  });

  it("a onda de chefe inclui o chefe no total de inimigos", () => {
    const normal = waveConfig(4);
    const boss = waveConfig(5);
    expect(boss.isBoss).toBe(true);
    expect(boss.boss).toEqual(bossConfig(5));
    expect(boss.enemyCount).toBe(waveConfig(5).enemyCount);
    expect(boss.enemyCount).toBeGreaterThan(normal.enemyCount);
  });

  it("o chefe fica mais forte a cada chefe", () => {
    const first = bossConfig(5);
    const second = bossConfig(10);
    expect(first.hp).toBe(BOSS.hpBase);
    expect(second.hp).toBe(BOSS.hpBase + BOSS.hpPerBoss);
    expect(second.speed).toBeGreaterThanOrEqual(first.speed);
    expect(second.speed).toBeLessThanOrEqual(BOSS.speedMax);
  });

  it("o chefe é mais forte que um inimigo comum, mas ainda pode ser derrotado", () => {
    const boss = bossConfig(5);
    expect(boss.hp).toBeGreaterThan(waveConfig(5).enemyHp);
    expect(boss.contactDamage).toBeGreaterThan(8);
    expect(boss.speed).toBeLessThan(waveConfig(5).enemySpeed);
  });
});

describe("killPoints", () => {
  it("concede 10 pontos na onda 1 e sobe 2 por onda", () => {
    expect(killPoints(1)).toBe(10);
    expect(killPoints(3)).toBe(14);
    expect(killPoints(0)).toBe(10);
  });
});

describe("upcomingWaves", () => {
  it("lista a onda atual e as seguintes, marcando as rodadas de chefe", () => {
    expect(upcomingWaves(3, 4)).toEqual([
      { wave: 3, isBoss: false },
      { wave: 4, isBoss: false },
      { wave: 5, isBoss: true },
      { wave: 6, isBoss: false },
    ]);
  });

  it("começa em 1 quando recebe valor inválido e respeita a quantidade pedida", () => {
    expect(upcomingWaves(0, 2).map((item) => item.wave)).toEqual([1, 2]);
    expect(upcomingWaves(5, 0)).toEqual([]);
  });
});
