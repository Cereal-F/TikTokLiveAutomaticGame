import { describe, expect, it } from "vitest";
import { BOSS_DESIGNS, bossDesignFor, bossNumberForWave } from "../../src/game/core/bosses.js";

describe("chefes", () => {
  it("há quatro chefes distintos, e o último é o chefe final", () => {
    expect(BOSS_DESIGNS).toHaveLength(4);
    expect(new Set(BOSS_DESIGNS.map((design) => design.texture)).size).toBe(4);
    expect(BOSS_DESIGNS[3]!.name).toBe("REI COROADO");
    expect(BOSS_DESIGNS[3]!.radius).toBeGreaterThan(BOSS_DESIGNS[0]!.radius * 1.5);
  });

  it("cada chefe tem pelo menos um padrão de tiro com dano e intervalo positivos", () => {
    for (const design of BOSS_DESIGNS) {
      expect(design.attacks.length).toBeGreaterThan(0);
      for (const attack of design.attacks) {
        expect(attack.intervalMs).toBeGreaterThan(0);
        expect(attack.count).toBeGreaterThan(0);
        expect(attack.damage).toBeGreaterThan(0);
      }
    }
  });

  it("o número do chefe sai da onda (5 = primeiro) e passa do último repete o último", () => {
    expect(bossNumberForWave(5)).toBe(1);
    expect(bossNumberForWave(20)).toBe(4);
    expect(bossDesignFor(1).name).toBe(BOSS_DESIGNS[0]!.name);
    expect(bossDesignFor(9).name).toBe("REI COROADO");
    expect(bossDesignFor(0).name).toBe(BOSS_DESIGNS[0]!.name);
  });
});
