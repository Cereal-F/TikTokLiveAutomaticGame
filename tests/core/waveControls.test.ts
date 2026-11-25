import { describe, expect, it } from "vitest";
import { GameSession } from "../../src/game/core/GameSession.js";
import { SPOTLIGHT, isProminentGift } from "../../src/game/core/spotlight.js";
import { chapterForWave } from "../../src/game/core/scenery.js";
import { giftEvent, likeEvent } from "../helpers/events.js";

describe("controles de onda do painel", () => {
  it("escolher uma onda começa essa onda, sem recompensa", () => {
    const session = new GameSession();
    session.start();
    const events = session.jumpToWave(7);
    expect(events).toEqual([{ type: "waveStarted", wave: 7 }]);
    expect(session.wave).toBe(7);
    expect(session.phase).toBe("playing");
  });

  it("escolher uma onda fora da campanha é limitado a ela", () => {
    const session = new GameSession();
    session.start();
    session.jumpToWave(99);
    expect(session.wave).toBe(20);
    session.jumpToWave(0);
    expect(session.wave).toBe(1);
  });

  it("pular a onda avança para a seguinte", () => {
    const session = new GameSession();
    session.start();
    session.jumpToWave(3);
    expect(session.skipWave()).toEqual([{ type: "waveStarted", wave: 4 }]);
    expect(session.wave).toBe(4);
  });

  it("pular a última onda vence a campanha", () => {
    const session = new GameSession();
    session.start();
    session.jumpToWave(20);
    const events = session.skipWave();
    expect(events.map((event) => event.type)).toEqual(["victory"]);
    expect(session.phase).toBe("victory");
  });

  it("depois de terminar a partida, os comandos não fazem nada", () => {
    const session = new GameSession();
    session.start();
    session.jumpToWave(20);
    session.skipWave();
    expect(session.jumpToWave(2)).toEqual([]);
    expect(session.skipWave()).toEqual([]);
  });
});

describe("destaque dos avisos", () => {
  it("presentes de 20 diamantes ou mais são grandes; os menores e as curtidas não", () => {
    expect(isProminentGift(SPOTLIGHT.prominentDiamonds)).toBe(true);
    expect(isProminentGift(SPOTLIGHT.prominentDiamonds - 1)).toBe(false);

    const session = new GameSession();
    session.start();
    expect(session.applyLiveEvent(giftEvent("g1", "ana", "Rosa", 1)).spotlight?.prominent).toBe(false);
    expect(session.applyLiveEvent(giftEvent("g2", "bia", "Chapéu", 20)).spotlight?.prominent).toBe(true);
    expect(session.applyLiveEvent(likeEvent("l1", "caio", 3)).spotlight?.prominent).toBe(false);
  });
});

describe("cenário por capítulo", () => {
  it("cada capítulo de 5 ondas tem um cenário próprio, na ordem dos inimigos", () => {
    expect(chapterForWave(1).floorKey).toBe("floor");
    expect(chapterForWave(6).index).toBe(1);
    expect(chapterForWave(6).kind).toBe("shooter");
    expect(chapterForWave(11).kind).toBe("charger");
    expect(chapterForWave(16).kind).toBe("tank");
    expect(chapterForWave(20).index).toBe(3);
  });

  it("as ondas de um mesmo capítulo compartilham o cenário", () => {
    expect(chapterForWave(7).floorKey).toBe(chapterForWave(9).floorKey);
    expect(chapterForWave(5).floorKey).not.toBe(chapterForWave(6).floorKey);
  });
});
