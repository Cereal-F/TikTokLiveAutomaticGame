import { describe, expect, it } from "vitest";
import { GameSession } from "../../src/game/core/GameSession.js";
import { PLAYER, SHIELD } from "../../src/game/core/constants.js";
import { giftEvent } from "../helpers/events.js";

function shieldSession(): GameSession {
  const session = new GameSession();
  session.start();
  session.applyLiveEvent(giftEvent("g1", "u1", "Chapéu", 20));
  return session;
}

/** Leva um golpe e espera a invulnerabilidade passar, como faria o tempo real entre dois toques. */
function hitAndWait(session: GameSession, amount: number) {
  const events = session.damagePlayer(amount);
  session.update(PLAYER.invulnerabilityMs);
  return events;
}

describe("escudo com reserva de dano", () => {
  it("cada golpe gasta a reserva, e a vida não cai enquanto houver reserva", () => {
    const session = shieldSession();
    expect(session.shieldHp).toBe(30);
    hitAndWait(session, 8);
    expect(session.shieldHp).toBe(22);
    hitAndWait(session, 8);
    expect(session.shieldHp).toBe(14);
    expect(session.hp).toBe(PLAYER.maxHp);
  });

  it("quando a reserva acaba, o escudo cai mesmo com tempo sobrando, e o excedente vai para a vida", () => {
    const session = shieldSession();
    hitAndWait(session, 8);
    hitAndWait(session, 8);
    hitAndWait(session, 8);
    expect(session.shieldHp).toBe(6);
    const events = session.damagePlayer(8);
    expect(events.map((event) => event.type)).toEqual(["shieldHit", "playerHit"]);
    expect(events[0]).toMatchObject({ type: "shieldHit", absorbed: 6, broken: true });
    expect(session.shieldActive).toBe(false);
    expect(session.shieldRemainingMs).toBe(0);
    expect(session.hp).toBe(PLAYER.maxHp - 2);
  });

  it("empilhar presentes soma a reserva, até o teto", () => {
    const session = new GameSession();
    session.start();
    for (let i = 0; i < 5; i += 1) session.applyLiveEvent(giftEvent(`g${i}`, "u1", "Chapéu", 20));
    expect(session.shieldHp).toBe(SHIELD.maxHp);
    expect(session.shieldMaxHp).toBe(SHIELD.maxHp);
  });

  it("a fúria continua deixando o personagem invulnerável, sem gastar reserva", () => {
    const session = new GameSession();
    session.start();
    session.applyLiveEvent(giftEvent("g1", "u1", "Leão", 100));
    expect(session.berserkActive).toBe(true);
    expect(session.isInvulnerable).toBe(true);
    expect(session.damagePlayer(8)).toEqual([]);
    expect(session.hp).toBe(PLAYER.maxHp);
  });
});
