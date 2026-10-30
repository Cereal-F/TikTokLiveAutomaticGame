import { describe, expect, it } from "vitest";
import { WAVES } from "../../src/game/core/constants.js";
import { bossConfig, commonBodyFor, isBossWave, killPoints, upcomingWaves, waveConfig } from "../../src/game/core/waves.js";

describe("waveConfig", () => {
  it("usa valores iniciais na onda 1, sem chefe", () => {
    expect(waveConfig(1)).toEqual({
      wave: 1,
      enemyCount: 8,
      spawnIntervalMs: 700,
      enemyHp: 3,
      enemySpeed: 96,
      kind: "virus",
      isBoss: false,
      isFinal: false,
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
    // Vida base no teto (40) multiplicada pelo fator do último tipo (ouriço, 2.2).
    expect(late.enemyHp).toBe(88);
    expect(late.enemySpeed).toBe(156);

    const bossWave = waveConfig(100);
    expect(bossWave.isBoss).toBe(true);
    expect(bossWave.enemyCount).toBeLessThanOrEqual(WAVES.maxEnemiesPerWave);
  });

  it("nunca diminui a quantidade nem o ritmo de uma onda para a seguinte", () => {
    for (let wave = 1; wave < 100; wave += 1) {
      const current = waveConfig(wave);
      const next = waveConfig(wave + 1);
      expect(next.spawnIntervalMs).toBeLessThanOrEqual(current.spawnIntervalMs);
      // Na troca de tipo (ondas 6, 11 e 16) a escolta pode diminuir: o atirador tem teto por onda.
      if (current.kind !== next.kind) continue;
      expect(next.enemyCount).toBeGreaterThanOrEqual(current.enemyCount);
    }
  });

  it("dentro de um mesmo capítulo a vida e a velocidade só sobem", () => {
    for (let wave = 1; wave < 20; wave += 1) {
      const current = waveConfig(wave);
      const next = waveConfig(wave + 1);
      if (current.kind !== next.kind) continue;
      expect(next.enemyHp).toBeGreaterThanOrEqual(current.enemyHp);
      expect(next.enemySpeed).toBeGreaterThanOrEqual(current.enemySpeed);
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

  it("cada chefe tem desenho próprio, e o último é o chefe final coroado", () => {
    const designs = [5, 10, 15, 20].map((wave) => bossConfig(wave).design.texture);
    expect(new Set(designs).size).toBe(4);
    expect(designs[3]).toBe("bossFinal");
    expect(bossConfig(20).design.name).toBe("REI COROADO");
    expect(bossConfig(5).hp).toBeLessThan(bossConfig(20).hp);
  });

  it("a fase final é a última da campanha", () => {
    expect(waveConfig(19).isFinal).toBe(false);
    expect(waveConfig(20).isFinal).toBe(true);
    expect(waveConfig(20).isBoss).toBe(true);
  });

  it("os tipos de inimigo trocam nas ondas 6, 11 e 16", () => {
    expect(waveConfig(5).kind).toBe("virus");
    expect(waveConfig(6).kind).toBe("shooter");
    expect(waveConfig(11).kind).toBe("charger");
    expect(waveConfig(16).kind).toBe("tank");
  });

  it("o chefe é mais forte que um inimigo comum, mas ainda pode ser derrotado", () => {
    const boss = bossConfig(5);
    expect(boss.hp).toBeGreaterThan(waveConfig(5).enemyHp);
    expect(boss.contactDamage).toBeGreaterThan(8);
    expect(boss.speed).toBeLessThan(waveConfig(5).enemySpeed);
  });
});

describe("commonBodyFor", () => {
  it("cada tipo de inimigo comum tem textura própria", () => {
    const textures = (["virus", "shooter", "charger", "tank"] as const).map((kind) => commonBodyFor(kind).texture);
    expect(new Set(textures).size).toBe(4);
  });

  it("o ouriço é o maior e o que mais machuca por contato entre os tipos comuns", () => {
    expect(commonBodyFor("tank").radius).toBeGreaterThan(commonBodyFor("virus").radius);
    expect(commonBodyFor("tank").contactDamage).toBeGreaterThan(commonBodyFor("virus").contactDamage);
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
