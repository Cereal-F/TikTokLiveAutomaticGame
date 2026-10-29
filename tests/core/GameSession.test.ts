import { describe, expect, it } from "vitest";
import { GameSession } from "../../src/game/core/GameSession.js";
import { LIVE_EFFECTS, PLAYER, WAVES } from "../../src/game/core/constants.js";
import { commentEvent, giftEvent, likeEvent } from "../helpers/events.js";

/** Inicia uma sessão e faz nascer todos os inimigos da onda 1 (6 inimigos). */
function sessionWithWaveOneSpawned(): GameSession {
  const session = new GameSession();
  session.start();
  session.update(10_000);
  return session;
}

describe("GameSession: ondas", () => {
  it("começa na onda 1 com vida cheia e fase jogando", () => {
    const session = new GameSession();
    const events = session.start();
    expect(events).toEqual([{ type: "waveStarted", wave: 1 }]);
    expect(session.phase).toBe("playing");
    expect(session.wave).toBe(1);
    expect(session.hp).toBe(PLAYER.maxHp);
  });

  it("faz nascer exatamente a quantidade de inimigos da onda, sem passar disso", () => {
    const session = new GameSession();
    session.start();
    const events = session.update(10_000);
    expect(events.filter((e) => e.type === "spawn")).toHaveLength(6);
    expect(session.enemiesAlive).toBe(6);
    expect(session.update(10_000).filter((e) => e.type === "spawn")).toHaveLength(0);
  });

  it("limpa a onda ao derrotar todos os inimigos e entra em intervalo", () => {
    const session = sessionWithWaveOneSpawned();
    for (let i = 0; i < 5; i += 1) {
      expect(session.registerKill()).toEqual([]);
    }
    expect(session.registerKill()).toEqual([{ type: "waveCleared", wave: 1 }]);
    expect(session.phase).toBe("intermission");
    expect(session.kills).toBe(6);
  });

  it("inicia a próxima onda depois do intervalo", () => {
    const session = sessionWithWaveOneSpawned();
    for (let i = 0; i < 6; i += 1) session.registerKill();

    expect(session.update(WAVES.intermissionMs - 1)).toEqual([]);
    expect(session.wave).toBe(1);
    expect(session.update(1)).toEqual([{ type: "waveStarted", wave: 2 }]);
    expect(session.wave).toBe(2);
    expect(session.phase).toBe("playing");
  });

  it("ignora abates durante o intervalo entre ondas", () => {
    const session = sessionWithWaveOneSpawned();
    for (let i = 0; i < 6; i += 1) session.registerKill();
    const scoreBefore = session.score;
    expect(session.registerKill()).toEqual([]);
    expect(session.score).toBe(scoreBefore);
  });

  it("concede pontos por abate", () => {
    const session = sessionWithWaveOneSpawned();
    session.registerKill();
    session.registerKill();
    expect(session.score).toBe(20);
  });
});

describe("GameSession: dano e derrota", () => {
  it("aplica dano e ativa invulnerabilidade temporária", () => {
    const session = new GameSession();
    session.start();
    const events = session.damagePlayer(8);
    expect(events).toEqual([{ type: "playerHit", damage: 8, hp: PLAYER.maxHp - 8 }]);
    expect(session.isInvulnerable).toBe(true);
  });

  it("não aplica dano durante a invulnerabilidade e volta a aplicar depois", () => {
    const session = new GameSession();
    session.start();
    session.damagePlayer(8);
    expect(session.damagePlayer(8)).toEqual([]);
    expect(session.hp).toBe(PLAYER.maxHp - 8);

    session.update(PLAYER.invulnerabilityMs);
    expect(session.isInvulnerable).toBe(false);
    session.damagePlayer(8);
    expect(session.hp).toBe(PLAYER.maxHp - 16);
  });

  it("encerra a partida quando a vida chega a zero", () => {
    const session = new GameSession();
    session.start();
    const events = session.damagePlayer(PLAYER.maxHp);
    expect(session.hp).toBe(0);
    expect(session.phase).toBe("defeated");
    expect(events.map((e) => e.type)).toEqual(["playerHit", "defeated"]);
  });

  it("congela a partida após a derrota", () => {
    const session = new GameSession();
    session.start();
    session.damagePlayer(PLAYER.maxHp);
    expect(session.update(5_000)).toEqual([]);
    expect(session.registerKill()).toEqual([]);
    expect(session.survivedMs).toBe(0);
  });

  it("nunca deixa a vida ficar negativa", () => {
    const session = new GameSession();
    session.start();
    session.damagePlayer(10_000);
    expect(session.hp).toBe(0);
  });

  it("a cura não ultrapassa a vida máxima", () => {
    const session = new GameSession();
    session.start();
    session.heal(50);
    expect(session.hp).toBe(PLAYER.maxHp);
  });
});

describe("GameSession: eventos da live", () => {
  it("curtidas somam pontos e geram texto de feedback", () => {
    const session = new GameSession();
    session.start();
    const feedback = session.applyLiveEvent(likeEvent("l1", "u1", 3));
    expect(session.score).toBe(3);
    expect(feedback).toEqual([{ text: "+3 curtidas", tone: "score" }]);
  });

  it("a cada 20 curtidas acumuladas cura 10 de vida", () => {
    const session = new GameSession();
    session.start();
    session.damagePlayer(50);
    const feedback = session.applyLiveEvent(likeEvent("l1", "u1", LIVE_EFFECTS.likesPerHeal));
    expect(session.hp).toBe(50 + LIVE_EFFECTS.likeHealAmount);
    expect(feedback.map((f) => f.tone)).toEqual(["score", "heal"]);
  });

  it("guarda o progresso de curtidas que não completou uma cura", () => {
    const session = new GameSession();
    session.start();
    session.damagePlayer(50);
    session.applyLiveEvent(likeEvent("l1", "u1", 15));
    expect(session.hp).toBe(50);
    session.applyLiveEvent(likeEvent("l2", "u2", 5));
    expect(session.hp).toBe(50 + LIVE_EFFECTS.likeHealAmount);
  });

  it("várias curas em um único lote de curtidas são aplicadas", () => {
    const session = new GameSession();
    session.start();
    session.damagePlayer(80);
    const feedback = session.applyLiveEvent(likeEvent("l1", "u1", 40));
    expect(session.hp).toBe(20 + 2 * LIVE_EFFECTS.likeHealAmount);
    expect(feedback.filter((f) => f.tone === "heal")).toHaveLength(2);
  });

  it("comentários dão pontos e mostram o texto do espectador", () => {
    const session = new GameSession();
    session.start();
    const feedback = session.applyLiveEvent(commentEvent("c1", "u1", "Vai!"));
    expect(session.score).toBe(LIVE_EFFECTS.commentScore);
    expect(feedback).toEqual([{ text: "Nome u1: Vai!", tone: "chat" }]);
  });

  it("presentes ativam o turbo de ataque e dão pontos pelo valor em diamantes", () => {
    const session = new GameSession();
    session.start();
    const feedback = session.applyLiveEvent(giftEvent("g1", "u1", "Leão", 99));
    expect(session.score).toBe(99);
    expect(session.boostActive).toBe(true);
    expect(feedback[0]?.tone).toBe("boost");
  });
});

describe("GameSession: turbo de ataque", () => {
  it("aumenta a cadência e o dano enquanto dura o turbo", () => {
    const session = new GameSession();
    session.start();
    const normalCooldown = session.attackCooldownMs;
    session.activateBoost(LIVE_EFFECTS.giftBoostMs);

    expect(session.attackCooldownMs).toBeLessThan(normalCooldown);
    expect(session.projectileDamage).toBe(PLAYER.boostedProjectileDamage);

    session.update(LIVE_EFFECTS.giftBoostMs - 1);
    expect(session.boostActive).toBe(true);
    session.update(1);
    expect(session.boostActive).toBe(false);
    expect(session.attackCooldownMs).toBe(normalCooldown);
    expect(session.projectileDamage).toBe(PLAYER.projectileDamage);
  });

  it("um novo presente não reduz a duração de um turbo já ativo", () => {
    const session = new GameSession();
    session.start();
    session.activateBoost(10_000);
    session.activateBoost(1_000);
    session.update(9_999);
    expect(session.boostActive).toBe(true);
  });
});

describe("GameSession: estatísticas", () => {
  it("resume a partida para a tela de derrota", () => {
    const session = sessionWithWaveOneSpawned();
    session.registerKill();
    expect(session.stats()).toEqual({ wave: 1, score: 10, kills: 1, survivedMs: 10_000 });
  });
});
