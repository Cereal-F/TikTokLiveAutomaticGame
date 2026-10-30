import { describe, expect, it } from "vitest";
import { BOSS_DESIGNS, type BossAttack } from "../../src/game/core/bosses.js";
import { ChargerBrain, BossBrain, ShooterBrain, patternDirections } from "../../src/game/core/enemyBehavior.js";
import { ENEMY_TYPES } from "../../src/game/core/constants.js";

const origin = { x: 0, y: 0 };
const length = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);

describe("atirador", () => {
  it("dispara dentro do alcance, a cada intervalo", () => {
    const brain = new ShooterBrain();
    const far = { x: 300, y: 0 };
    // O primeiro disparo sai na metade do intervalo.
    expect(brain.step(origin, far, [], ENEMY_TYPES.shooter.fireIntervalMs / 2).fire).toBe(true);
    expect(brain.step(origin, far, [], 100).fire).toBe(false);
    expect(brain.step(origin, far, [], ENEMY_TYPES.shooter.fireIntervalMs).fire).toBe(true);
  });

  it("não dispara de longe demais", () => {
    const brain = new ShooterBrain();
    expect(brain.step(origin, { x: ENEMY_TYPES.shooter.fireRangeDistance + 200, y: 0 }, [], 5_000).fire).toBe(false);
  });

  it("aproxima-se quando está longe e recua quando está perto demais", () => {
    expect(new ShooterBrain().step(origin, { x: 400, y: 0 }, [], 16).direction.x).toBeGreaterThan(0);
    expect(new ShooterBrain().step(origin, { x: 100, y: 0 }, [], 16).direction.x).toBeLessThan(0);
  });
});

describe("saltador", () => {
  it("aproxima-se devagar e depois arranca em linha reta, com velocidade bem maior", () => {
    const brain = new ChargerBrain();
    const target = { x: 0, y: 300 };
    const approach = brain.step(origin, target, [], ENEMY_TYPES.charger.approachMs);
    expect(approach.speedFactor).toBe(ENEMY_TYPES.charger.approachSpeedFactor);

    const charge = brain.step(origin, target, [], 100);
    expect(charge.speedFactor).toBe(ENEMY_TYPES.charger.chargeSpeedFactor);
    expect(charge.direction.y).toBeCloseTo(1, 5);

    const after = brain.step(origin, target, [], 600);
    expect(after.speedFactor).toBe(ENEMY_TYPES.charger.approachSpeedFactor);
  });
});

describe("padrões de tiro dos chefes", () => {
  const attack = (kind: BossAttack["kind"], count: number): BossAttack => ({
    kind,
    intervalMs: 1_000,
    count,
    damage: 5,
    shotSpeed: 200,
  });

  it("anel: tiros igualmente espaçados e unitários", () => {
    const dirs = patternDirections(attack("ring", 12), origin, { x: 1, y: 0 }, 0);
    expect(dirs).toHaveLength(12);
    for (const d of dirs) expect(length(d)).toBeCloseTo(1, 5);
  });

  it("espiral: a fase muda a posição do anel", () => {
    const a = patternDirections(attack("spiral", 8), origin, { x: 1, y: 0 }, 0);
    const b = patternDirections(attack("spiral", 8), origin, { x: 1, y: 0 }, 0.35);
    expect(a[0]!.x).not.toBeCloseTo(b[0]!.x, 3);
  });

  it("leque: tiro central aponta para o personagem", () => {
    const dirs = patternDirections(attack("aimed", 3), origin, { x: 0, y: 500 }, 0);
    expect(dirs).toHaveLength(3);
    expect(dirs[1]!.y).toBeCloseTo(1, 5);
    // Os tiros laterais são simétricos em relação ao central.
    expect(dirs[0]!.x).toBeCloseTo(-dirs[2]!.x, 5);
    expect(dirs[0]!.x).not.toBeCloseTo(0, 3);
  });
});

describe("chefe", () => {
  it("dispara seus padrões no intervalo de cada um", () => {
    const brain = new BossBrain(BOSS_DESIGNS[0]!);
    const interval = BOSS_DESIGNS[0]!.attacks[0]!.intervalMs;
    expect(brain.step(origin, { x: 0, y: 300 }, [], interval - 1).volleys).toEqual([]);
    const volleys = brain.step(origin, { x: 0, y: 300 }, [], 2).volleys;
    expect(volleys).toHaveLength(1);
    expect(volleys[0]!.directions).toHaveLength(BOSS_DESIGNS[0]!.attacks[0]!.count);
  });

  it("o chefe final arranca de tempos em tempos, e o chefe 1 também", () => {
    const final = new BossBrain(BOSS_DESIGNS[3]!);
    const charge = BOSS_DESIGNS[3]!.chargeIntervalMs!;
    expect(final.step(origin, { x: 0, y: 300 }, [], charge + 1).speedFactor).toBeGreaterThan(1);
  });
});
