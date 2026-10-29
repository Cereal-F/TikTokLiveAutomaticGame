import { describe, expect, it } from "vitest";
import { Autopilot, type AutopilotView } from "../../src/game/core/autopilot.js";
import { AUTOPILOT, DASH, WORLD } from "../../src/game/core/constants.js";

const center = { x: WORLD.width / 2, y: WORLD.height / 2 };

function view(enemies: { x: number; y: number }[], position = center): AutopilotView {
  return { position, enemies, world: WORLD };
}

/** Produto escalar entre a direção do personagem e a direção até o alvo (1 = mesma direção, -1 = oposta). */
function alignment(move: { x: number; y: number }, from: { x: number; y: number }, to: { x: number; y: number }): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return (move.x * dx + move.y * dy) / length;
}

describe("Autopilot", () => {
  it("retorna um vetor unitário ou zero", () => {
    const pilot = new Autopilot(() => 0.3);
    const move = pilot.steer(view([{ x: center.x + 400, y: center.y }]));
    expect(Math.hypot(move.x, move.y)).toBeCloseTo(1);
  });

  it("aproxima-se de um inimigo distante", () => {
    const pilot = new Autopilot();
    const enemy = { x: center.x + 500, y: center.y };
    const move = pilot.steer(view([enemy]));
    expect(alignment(move, center, enemy)).toBeGreaterThan(0.9);
  });

  it("foge de um inimigo muito perto", () => {
    const pilot = new Autopilot();
    const enemy = { x: center.x + 60, y: center.y };
    const move = pilot.steer(view([enemy]));
    expect(alignment(move, center, enemy)).toBeLessThan(-0.9);
  });

  it("circula o inimigo quando ele está na faixa de órbita (movimento quase perpendicular)", () => {
    const pilot = new Autopilot();
    const distanceToEnemy = (AUTOPILOT.fleeDistance + AUTOPILOT.orbitDistance) / 2;
    const enemy = { x: center.x + distanceToEnemy, y: center.y };
    const move = pilot.steer(view([enemy]));
    expect(Math.abs(alignment(move, center, enemy))).toBeLessThan(0.3);
  });

  it("afasta-se da borda quando está perto dela, mesmo sem inimigos", () => {
    const pilot = new Autopilot(() => 0.5);
    const nearLeftWall = { x: 10, y: center.y };
    const move = pilot.steer(view([], nearLeftWall));
    expect(move.x).toBeGreaterThan(0);
  });

  it("sem inimigos, vagueia em direção a um ponto sorteado", () => {
    const pilot = new Autopilot(() => 0.5);
    const move = pilot.steer(view([], center));
    // Com o sorteio em 0,5 o ponto de vagar é o centro da arena: o personagem já está lá, então não há deslocamento.
    expect(Math.hypot(move.x, move.y)).toBeCloseTo(0);

    const offCenter = pilot.steer(view([], { x: 200, y: 300 }));
    expect(Math.hypot(offCenter.x, offCenter.y)).toBeGreaterThan(0.5);
  });

  it("não exige nenhuma entrada do jogador: a mesma visão sempre gera a mesma decisão", () => {
    const enemies = [{ x: center.x + 300, y: center.y - 120 }];
    const a = new Autopilot(() => 0.2).steer(view(enemies));
    const b = new Autopilot(() => 0.2).steer(view(enemies));
    expect(a).toEqual(b);
  });
});

describe("Autopilot: arrancadas (dash)", () => {
  it("sem sorteio de intervalo, dispara uma arrancada no tempo mínimo e a mantém pela duração", () => {
    const pilot = new Autopilot(() => 0);
    // Intervalo mínimo: nenhuma arrancada antes do primeiro intervalo.
    expect(pilot.dashMultiplier(DASH.minIntervalMs - 100)).toBe(1);
    expect(pilot.dashMultiplier(100)).toBe(DASH.multiplier);
    // Continua acelerado enquanto a arrancada dura, depois volta ao normal.
    expect(pilot.dashMultiplier(DASH.durationMs - 50)).toBe(DASH.multiplier);
    expect(pilot.dashMultiplier(100)).toBe(DASH.multiplier);
    expect(pilot.dashMultiplier(DASH.durationMs * 2)).toBe(1);
    expect(pilot.dashMultiplier(16)).toBe(1);
  });

  it("nunca dispara antes do intervalo mínimo nem deixa de disparar por muito tempo", () => {
    const pilot = new Autopilot(() => 0.5);
    let elapsed = 0;
    let firstDashAt = -1;
    while (elapsed < DASH.maxIntervalMs + DASH.durationMs && firstDashAt < 0) {
      elapsed += 16;
      if (pilot.dashMultiplier(16) !== 1) firstDashAt = elapsed;
    }
    expect(firstDashAt).toBeGreaterThanOrEqual(DASH.minIntervalMs);
    expect(firstDashAt).toBeLessThanOrEqual(DASH.maxIntervalMs + 16);
  });

  it("reset reinicia o ciclo de arrancadas", () => {
    const pilot = new Autopilot(() => 0);
    pilot.dashMultiplier(DASH.minIntervalMs);
    pilot.reset();
    expect(pilot.dashMultiplier(DASH.minIntervalMs - 100)).toBe(1);
  });
});
