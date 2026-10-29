import { describe, expect, it } from "vitest";
import { WORLD } from "../../src/game/core/constants.js";
import { formatTime } from "../../src/game/core/format.js";
import { edgeSpawnPoint } from "../../src/game/core/spawnPoints.js";
import { directionTo, distance, findNearest } from "../../src/game/core/targeting.js";

describe("distance", () => {
  it("calcula a distância euclidiana", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("findNearest", () => {
  const origin = { x: 0, y: 0 };

  it("retorna o item mais próximo dentro do alcance", () => {
    const items = [
      { id: "far", x: 90, y: 0 },
      { id: "near", x: 10, y: 0 },
    ];
    expect(findNearest(origin, items, 100)?.id).toBe("near");
  });

  it("ignora itens fora do alcance", () => {
    expect(findNearest(origin, [{ x: 200, y: 0 }], 100)).toBeNull();
  });

  it("inclui um item exatamente na borda do alcance", () => {
    expect(findNearest(origin, [{ x: 100, y: 0 }], 100)).not.toBeNull();
  });

  it("retorna null para uma lista vazia", () => {
    expect(findNearest(origin, [], 100)).toBeNull();
  });
});

describe("directionTo", () => {
  it("retorna um vetor unitário apontando para o alvo", () => {
    const d = directionTo({ x: 0, y: 0 }, { x: 0, y: -10 });
    expect(d.x).toBeCloseTo(0);
    expect(d.y).toBeCloseTo(-1);
  });

  it("retorna vetor nulo quando os pontos coincidem", () => {
    expect(directionTo({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 0, y: 0 });
  });
});

describe("edgeSpawnPoint", () => {
  // Valores escolhidos para cair em cada uma das quatro bordas: floor(valor * 4) = lado.
  const sideValues = [0.01, 0.26, 0.51, 0.76];

  it("nasce fora da arena, em uma das quatro bordas", () => {
    const expectations = [
      (p: { x: number; y: number }) => p.y < 0,
      (p: { x: number; y: number }) => p.x > WORLD.width,
      (p: { x: number; y: number }) => p.y > WORLD.height,
      (p: { x: number; y: number }) => p.x < 0,
    ];
    sideValues.forEach((side, index) => {
      const values = [side, 0.5];
      const point = edgeSpawnPoint(() => values.shift() ?? 0, WORLD);
      expect(expectations[index]!(point)).toBe(true);
    });
  });

  it("sempre gera pontos fora da área visível para valores aleatórios quaisquer", () => {
    let seed = 42;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 500; i += 1) {
      const p = edgeSpawnPoint(random, WORLD);
      const outside = p.x < 0 || p.x > WORLD.width || p.y < 0 || p.y > WORLD.height;
      expect(outside).toBe(true);
    }
  });
});

describe("formatTime", () => {
  it("formata minutos e segundos com dois dígitos", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(61_500)).toBe("01:01");
    expect(formatTime(3_600_000)).toBe("60:00");
  });

  it("trata valores inválidos como zero", () => {
    expect(formatTime(-1)).toBe("00:00");
    expect(formatTime(Number.NaN)).toBe("00:00");
  });
});
