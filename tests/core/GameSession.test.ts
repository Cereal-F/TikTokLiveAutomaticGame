import { describe, expect, it } from "vitest";
import { GameSession } from "../../src/game/core/GameSession.js";
import { BOSS, LIVE_EFFECTS, PLAYER, WAVES } from "../../src/game/core/constants.js";
import { GIFT_POWERS } from "../../src/game/core/powers.js";
import { killPoints, waveConfig } from "../../src/game/core/waves.js";
import { commentEvent, giftEvent, likeEvent } from "../helpers/events.js";

const WAVE_ONE = waveConfig(1).enemyCount;

/** Inicia uma sessão e faz nascer todos os inimigos da onda 1. */
function sessionWithWaveOneSpawned(): GameSession {
  const session = new GameSession();
  session.start();
  session.update(10_000);
  return session;
}

describe("GameSession: ondas", () => {
  it("começa na onda 1 com vida cheia e fase jogando", () => {
    const session = new GameSession();
    expect(session.start()).toEqual([{ type: "waveStarted", wave: 1 }]);
    expect(session.phase).toBe("playing");
    expect(session.wave).toBe(1);
    expect(session.hp).toBe(PLAYER.maxHp);
  });

  it("faz nascer exatamente a quantidade de inimigos da onda, sem passar disso", () => {
    const session = new GameSession();
    session.start();
    expect(session.update(10_000).filter((e) => e.type === "spawn")).toHaveLength(WAVE_ONE);
    expect(session.enemiesAlive).toBe(WAVE_ONE);
    expect(session.update(10_000).filter((e) => e.type === "spawn")).toHaveLength(0);
  });

  it("limpa a onda ao derrotar todos os inimigos e entra em intervalo", () => {
    const session = sessionWithWaveOneSpawned();
    for (let i = 0; i < WAVE_ONE - 1; i += 1) {
      expect(session.registerKill()).toEqual([]);
    }
    expect(session.registerKill()).toEqual([{ type: "waveCleared", wave: 1 }]);
    expect(session.phase).toBe("intermission");
    expect(session.kills).toBe(WAVE_ONE);
  });

  it("inicia a próxima onda depois do intervalo", () => {
    const session = sessionWithWaveOneSpawned();
    for (let i = 0; i < WAVE_ONE; i += 1) session.registerKill();

    expect(session.update(WAVES.intermissionMs - 1)).toEqual([]);
    expect(session.wave).toBe(1);
    expect(session.update(1)).toEqual([{ type: "waveStarted", wave: 2 }]);
    expect(session.wave).toBe(2);
    expect(session.phase).toBe("playing");
  });

  it("ignora abates durante o intervalo entre ondas", () => {
    const session = sessionWithWaveOneSpawned();
    for (let i = 0; i < WAVE_ONE; i += 1) session.registerKill();
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
    expect(session.damagePlayer(8)).toEqual([{ type: "playerHit", damage: 8, hp: PLAYER.maxHp - 8 }]);
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

describe("GameSession: curtidas e comentários", () => {
  it("curtidas somam pontos e geram texto de feedback", () => {
    const session = new GameSession();
    session.start();
    const { feedback, events } = session.applyLiveEvent(likeEvent("l1", "u1", 3));
    expect(session.score).toBe(3);
    expect(feedback).toEqual([{ text: "+3 curtidas", tone: "score" }]);
    expect(events).toEqual([]);
  });

  it("a cada 20 curtidas acumuladas cura 10 de vida", () => {
    const session = new GameSession();
    session.start();
    session.damagePlayer(50);
    const { feedback } = session.applyLiveEvent(likeEvent("l1", "u1", LIVE_EFFECTS.likesPerHeal));
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
    const { feedback } = session.applyLiveEvent(likeEvent("l1", "u1", 40));
    expect(session.hp).toBe(20 + 2 * LIVE_EFFECTS.likeHealAmount);
    expect(feedback.filter((f) => f.tone === "heal")).toHaveLength(2);
  });

  it("comentários dão pontos e mostram o texto do espectador", () => {
    const session = new GameSession();
    session.start();
    const { feedback } = session.applyLiveEvent(commentEvent("c1", "u1", "Vai!"));
    expect(session.score).toBe(LIVE_EFFECTS.commentScore);
    expect(feedback).toEqual([{ text: "Nome u1: Vai!", tone: "chat" }]);
  });
});

describe("GameSession: presentes e poderes", () => {
  it("um presente barato ativa o turbo de ataque", () => {
    const session = new GameSession();
    session.start();
    const { feedback, events } = session.applyLiveEvent(giftEvent("g1", "u1", "Rosa", 1));
    expect(session.score).toBe(1);
    expect(session.turboActive).toBe(true);
    expect(events).toEqual([{ type: "power", power: GIFT_POWERS[0] }]);
    expect(feedback.map((f) => f.tone)).toEqual(["boost", "power"]);
  });

  it("um presente de 20 diamantes ativa o escudo e o jogador fica invulnerável", () => {
    const session = new GameSession();
    session.start();
    session.applyLiveEvent(giftEvent("g1", "u1", "Chapéu", 20));
    expect(session.shieldActive).toBe(true);
    expect(session.isInvulnerable).toBe(true);
    expect(session.damagePlayer(8)).toEqual([]);
    expect(session.hp).toBe(PLAYER.maxHp);
  });

  it("o escudo expira e o dano volta a valer", () => {
    const session = new GameSession();
    session.start();
    session.applyLiveEvent(giftEvent("g1", "u1", "Chapéu", 20));
    session.update(GIFT_POWERS[1]!.shieldMs);
    expect(session.shieldActive).toBe(false);
    expect(session.damagePlayer(8)).not.toEqual([]);
  });

  it("um presente de 100 diamantes gera uma explosão em área e não ativa turbo", () => {
    const session = new GameSession();
    session.start();
    const { events } = session.applyLiveEvent(giftEvent("g1", "u1", "Leão", 100));
    expect(events).toEqual([{ type: "power", power: GIFT_POWERS[2] }]);
    expect(session.turboActive).toBe(false);
  });

  it("um presente de 500 diamantes cura, ativa turbo e gera a tempestade", () => {
    const session = new GameSession();
    session.start();
    session.damagePlayer(60);
    const { events } = session.applyLiveEvent(giftEvent("g1", "u1", "Foguete", 500));
    expect(events).toEqual([{ type: "power", power: GIFT_POWERS[3] }]);
    // 100 - 60 de dano + 25 de cura da tempestade = 65.
    expect(session.hp).toBe(65);
    expect(session.turboActive).toBe(true);
  });

  it("presentes mais caros têm efeitos mais fortes", () => {
    const tiers = [...GIFT_POWERS];
    for (let i = 1; i < tiers.length; i += 1) {
      expect(tiers[i]!.minDiamonds).toBeGreaterThan(tiers[i - 1]!.minDiamonds);
    }
    expect(tiers[3]!.blastDamage).toBeGreaterThan(tiers[2]!.blastDamage);
  });

  it("presentes de valor zero não ativam poder algum", () => {
    const session = new GameSession();
    session.start();
    const { events } = session.applyLiveEvent(giftEvent("g1", "u1", "Nada", 0));
    expect(events).toEqual([]);
    expect(session.turboActive).toBe(false);
  });

  it("o presente soma pontos pelo valor em diamantes", () => {
    const session = new GameSession();
    session.start();
    session.applyLiveEvent(giftEvent("g1", "u1", "Leão", 100));
    expect(session.score).toBe(100);
  });

  it("não aplica poderes depois da derrota", () => {
    const session = new GameSession();
    session.start();
    session.damagePlayer(PLAYER.maxHp);
    const { events } = session.applyLiveEvent(giftEvent("g1", "u1", "Foguete", 500));
    expect(events).toEqual([]);
    expect(session.turboActive).toBe(false);
  });
});

describe("GameSession: turbo e escudo", () => {
  it("aumenta a cadência e o dano enquanto dura o turbo", () => {
    const session = new GameSession();
    session.start();
    const normalCooldown = session.attackCooldownMs;
    session.activateTurbo(6_000);

    expect(session.attackCooldownMs).toBeLessThan(normalCooldown);
    expect(session.projectileDamage).toBe(PLAYER.boostedProjectileDamage);
    expect(session.turboRemainingMs).toBe(6_000);

    session.update(5_999);
    expect(session.turboActive).toBe(true);
    session.update(1);
    expect(session.turboActive).toBe(false);
    expect(session.attackCooldownMs).toBe(normalCooldown);
    expect(session.projectileDamage).toBe(PLAYER.projectileDamage);
  });

  it("um novo turbo não reduz a duração de um turbo já ativo", () => {
    const session = new GameSession();
    session.start();
    session.activateTurbo(10_000);
    session.activateTurbo(1_000);
    session.update(9_999);
    expect(session.turboActive).toBe(true);
  });
});

describe("GameSession: estatísticas", () => {
  it("resume a partida para a tela de derrota", () => {
    const session = sessionWithWaveOneSpawned();
    session.registerKill();
    expect(session.stats()).toEqual({ wave: 1, score: 10, kills: 1, survivedMs: 10_000 });
  });
});

/** Avança a partida até a onda desejada, derrotando todos os inimigos de cada onda. */
function reachWave(target: number): GameSession {
  const session = new GameSession();
  session.start();
  while (session.wave < target) {
    session.update(60_000);
    const count = waveConfig(session.wave).enemyCount;
    for (let i = 0; i < count; i += 1) session.registerKill();
    session.update(WAVES.intermissionMs);
  }
  return session;
}

describe("GameSession: chefes", () => {
  it("a onda 1 não tem chefe: todos os inimigos nascem como comuns", () => {
    const fresh = new GameSession();
    fresh.start();
    const created = fresh.update(60_000).filter((e) => e.type === "spawn");
    expect(created).toHaveLength(WAVE_ONE);
    expect(created.every((e) => e.type === "spawn" && e.boss === false)).toBe(true);
  });

  it("na onda 5, o primeiro inimigo que nasce é o chefe e os demais são escolta", () => {
    const session = reachWave(5);
    expect(session.wave).toBe(5);
    const spawns = session.update(60_000).filter((e) => e.type === "spawn");
    expect(spawns).toHaveLength(waveConfig(5).enemyCount);
    expect(spawns[0]).toEqual({ type: "spawn", boss: true });
    expect(spawns.slice(1).every((e) => e.type === "spawn" && e.boss === false)).toBe(true);
  });

  it("derrotar o chefe vale mais pontos e conta como abate", () => {
    const session = reachWave(5);
    session.update(60_000);
    const scoreBefore = session.score;
    const killsBefore = session.kills;
    session.registerKill(true);
    expect(session.score - scoreBefore).toBe(killPoints(5) * BOSS.pointsMultiplier);
    expect(session.kills).toBe(killsBefore + 1);
  });
});
