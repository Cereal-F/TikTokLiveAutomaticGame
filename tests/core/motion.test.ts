import { describe, expect, it } from "vitest";
import { approachVelocity } from "../../src/game/core/motion.js";

describe("approachVelocity", () => {
  it("acelera de forma limitada, sem pular direto para a velocidade máxima", () => {
    const v = approachVelocity({ x: 0, y: 0 }, { x: 1, y: 0 }, 260, 1_100, 100);
    expect(v.x).toBeCloseTo(110, 5);
    expect(v.y).toBe(0);
  });

  it("chega exatamente à velocidade desejada quando a aceleração basta", () => {
    expect(approachVelocity({ x: 0, y: 0 }, { x: 0, y: 1 }, 260, 10_000, 100)).toEqual({ x: 0, y: 260 });
  });

  it("desacelera até parar quando a direção desejada é zero", () => {
    const v = approachVelocity({ x: 260, y: 0 }, { x: 0, y: 0 }, 0, 1_100, 100);
    expect(v.x).toBeCloseTo(150, 5);
  });

  it("uma mudança brusca de direção vira curva: a primeira virada é pequena", () => {
    const v = approachVelocity({ x: 260, y: 0 }, { x: 0, y: 1 }, 260, 1_100, 16);
    // Em 16 ms a aceleração permite no máximo ~17,6 px/s de mudança.
    expect(Math.abs(v.y)).toBeLessThanOrEqual(1_100 * 0.016 + 1e-9);
    expect(v.x).toBeGreaterThan(0);
  });
});
