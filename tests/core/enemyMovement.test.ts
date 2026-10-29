import { describe, expect, it } from "vitest";
import { ENEMY } from "../../src/game/core/constants.js";
import { chaseDirection } from "../../src/game/core/enemyMovement.js";
import { distance } from "../../src/game/core/targeting.js";

describe("chaseDirection", () => {
  it("sem vizinhos, aponta direto para o alvo", () => {
    const direction = chaseDirection({ x: 0, y: 0 }, { x: 100, y: 0 }, []);
    expect(direction.x).toBeCloseTo(1);
    expect(direction.y).toBeCloseTo(0);
  });

  it("retorna vetor unitário quando há repulsão", () => {
    const direction = chaseDirection({ x: 0, y: 0 }, { x: 100, y: 0 }, [{ x: 10, y: 0 }]);
    expect(Math.hypot(direction.x, direction.y)).toBeCloseTo(1);
  });

  it("um vizinho muito próximo empurra o inimigo para o lado oposto", () => {
    // O vizinho está à direita; o alvo também. A repulsão tira o inimigo do vizinho, para a esquerda.
    const direction = chaseDirection({ x: 0, y: 0 }, { x: 0, y: 200 }, [{ x: 8, y: 0 }]);
    expect(direction.x).toBeLessThan(0);
    expect(direction.y).toBeGreaterThan(0);
  });

  it("vizinhos fora do raio de separação não alteram a direção", () => {
    const far = ENEMY.separationRadius * 3;
    const direction = chaseDirection({ x: 0, y: 0 }, { x: 0, y: 200 }, [{ x: far, y: 0 }]);
    expect(direction.x).toBeCloseTo(0);
    expect(direction.y).toBeCloseTo(1);
  });

  it("inimigos espalhados se afastam: a separação deixa um grupo mais aberto", () => {
    // Três inimigos em linha, chegando ao mesmo alvo: os das pontas devem se afastar do centro.
    const target = { x: 0, y: 0 };
    const group = [{ x: -10, y: 300 }, { x: 0, y: 300 }, { x: 10, y: 300 }];
    const moves = group.map((self, index) => {
      const others = group.filter((_, i) => i !== index);
      const d = chaseDirection(self, target, others);
      return { x: self.x + d.x * 20, y: self.y + d.y * 20 };
    });
    const spreadBefore = distance(group[0]!, group[2]!);
    const spreadAfter = distance(moves[0]!, moves[2]!);
    expect(spreadAfter).toBeGreaterThan(spreadBefore);
  });

  it("sobre o alvo e sem vizinhos, não há direção", () => {
    const direction = chaseDirection({ x: 5, y: 5 }, { x: 5, y: 5 }, []);
    expect(direction).toEqual({ x: 0, y: 0 });
  });
});
