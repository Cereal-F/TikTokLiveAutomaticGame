import { describe, expect, it } from "vitest";
import { GiftStreakTracker } from "../../src/server/live/tikfinity/GiftStreakTracker.js";
import { isLocalWebSocketUrl } from "../../src/server/live/tikfinity/localUrl.js";
import { mapChat, mapLike, parseEnvelope, readGift } from "../../src/server/live/tikfinity/mapping.js";
import { parseLiveEvent } from "../../src/server/validation.js";

describe("parseEnvelope", () => {
  it("lê o evento e o objeto data", () => {
    expect(parseEnvelope('{"event":"chat","data":{"comment":"oi"}}')).toEqual({
      event: "chat",
      data: { comment: "oi" },
    });
  });

  it("descarta texto que não é JSON ou não tem o formato esperado", () => {
    expect(parseEnvelope("{não é json")).toBeNull();
    expect(parseEnvelope('{"data":{}}')).toBeNull();
    expect(parseEnvelope('{"event":"chat","data":"texto"}')).toBeNull();
    expect(parseEnvelope("[1,2,3]")).toBeNull();
  });
});

describe("identidade e comentários", () => {
  it("usa uniqueId como chave e o apelido como nome exibido", () => {
    expect(mapChat({ uniqueId: "ana_live", nickname: "Ana ✨", comment: "boa!" })).toEqual({
      kind: "comment",
      userId: "ana_live",
      userName: "Ana ✨",
      text: "boa!",
    });
  });

  it("sem apelido, exibe o uniqueId; sem uniqueId, aceita userId numérico", () => {
    expect(mapChat({ uniqueId: "ana", comment: "oi" })).toMatchObject({ userName: "ana" });
    expect(mapChat({ userId: 42, comment: "oi" })).toMatchObject({ userId: "42", userName: "42" });
  });

  it("descarta comentário vazio ou mensagem sem identidade", () => {
    expect(mapChat({ uniqueId: "ana", comment: "   " })).toBeNull();
    expect(mapChat({ comment: "oi" })).toBeNull();
  });

  it("corta comentários longos no limite aceito pelo pipeline", () => {
    const draft = mapChat({ uniqueId: "ana", comment: "x".repeat(500) });
    expect(draft?.kind === "comment" && draft.text.length).toBe(200);
  });
});

describe("curtidas", () => {
  it("lê likeCount como quantidade", () => {
    expect(mapLike({ uniqueId: "ana", likeCount: 7 })).toMatchObject({ kind: "like", count: 7 });
  });

  it("reduz lotes grandes ao teto aceito e descarta contagens inválidas", () => {
    expect(mapLike({ uniqueId: "ana", likeCount: 5000 })).toMatchObject({ count: 100 });
    expect(mapLike({ uniqueId: "ana", likeCount: 0 })).toBeNull();
    expect(mapLike({ uniqueId: "ana", likeCount: -3 })).toBeNull();
    expect(mapLike({ uniqueId: "ana", likeCount: 1.5 })).toBeNull();
    expect(mapLike({ uniqueId: "ana" })).toBeNull();
  });
});

describe("presentes", () => {
  it("lê os campos do presente e assume uma unidade quando repeatCount falta", () => {
    expect(
      readGift({ uniqueId: "ana", giftName: "Rosa", giftId: 5655, diamondCount: 1, giftType: 0, msgId: "m1" }),
    ).toEqual({
      userId: "ana",
      userName: "ana",
      giftId: "5655",
      giftName: "Rosa",
      diamondCount: 1,
      repeatCount: 1,
      repeatEnd: false,
      streakable: false,
      msgId: "m1",
    });
  });

  it("reconhece presente em sequência pelo giftType 1", () => {
    expect(readGift({ uniqueId: "a", giftName: "X", diamondCount: 1, giftType: 1 })?.streakable).toBe(true);
  });

  it("descarta presente sem nome, sem diamantes ou com diamantes negativos", () => {
    expect(readGift({ uniqueId: "a", diamondCount: 1 })).toBeNull();
    expect(readGift({ uniqueId: "a", giftName: "X" })).toBeNull();
    expect(readGift({ uniqueId: "a", giftName: "X", diamondCount: -1 })).toBeNull();
  });
});

describe("GiftStreakTracker", () => {
  const streak = (repeatCount: number, repeatEnd = false, userId = "ana") =>
    readGift({ uniqueId: userId, giftName: "Leão", giftId: 1, diamondCount: 10, giftType: 1, repeatCount, repeatEnd })!;

  it("presente sem sequência é concluído na hora, multiplicado pela quantidade", () => {
    const tracker = new GiftStreakTracker(4_000);
    const gift = readGift({ uniqueId: "ana", giftName: "Rosa", giftId: 1, diamondCount: 5, giftType: 0, repeatCount: 2 })!;
    const done = tracker.observe(gift, 0);
    expect(done).toHaveLength(1);
    expect(done[0]?.draft).toMatchObject({ kind: "gift", giftName: "Rosa", diamonds: 10 });
  });

  it("soma a sequência inteira uma única vez, ao terminar", () => {
    const tracker = new GiftStreakTracker(4_000);
    expect(tracker.observe(streak(1), 0)).toEqual([]);
    expect(tracker.observe(streak(2), 500)).toEqual([]);
    expect(tracker.observe(streak(3, true), 1_000)).toHaveLength(1);
    expect(tracker.observe(streak(3, true), 1_100)[0]?.draft.diamonds).toBe(30);
    expect(tracker.pendingCount).toBe(0);
  });

  it("conclui a sequência sem fim após o tempo limite, sem concluir antes", () => {
    const tracker = new GiftStreakTracker(4_000);
    tracker.observe(streak(2), 0);
    expect(tracker.flushExpired(3_999)).toEqual([]);
    const done = tracker.flushExpired(4_000);
    expect(done).toHaveLength(1);
    expect(done[0]?.draft.diamonds).toBe(20);
  });

  it("mantém sequências de pessoas diferentes separadas", () => {
    const tracker = new GiftStreakTracker(4_000);
    tracker.observe(streak(2, false, "ana"), 0);
    tracker.observe(streak(4, false, "bruno"), 0);
    const totals = tracker.flushAll().map((item) => item.draft.diamonds).sort((a, b) => a - b);
    expect(totals).toEqual([20, 40]);
  });

  it("flushAll entrega sequências abertas (ao parar o provedor)", () => {
    const tracker = new GiftStreakTracker(4_000);
    tracker.observe(streak(3), 0);
    expect(tracker.flushAll()).toHaveLength(1);
    expect(tracker.flushAll()).toEqual([]);
  });

  it("limita o valor total ao teto de diamantes do pipeline", () => {
    const tracker = new GiftStreakTracker(4_000);
    const huge = readGift({ uniqueId: "ana", giftName: "Universo", giftId: 9, diamondCount: 90_000, giftType: 0, repeatCount: 5 })!;
    expect(tracker.observe(huge, 0)[0]?.draft.diamonds).toBe(100_000);
  });

  it("rejeita tempo limite não positivo", () => {
    expect(() => new GiftStreakTracker(0)).toThrow(RangeError);
  });

  it("o rascunho de presente passa pela validação de eventos reais", () => {
    const tracker = new GiftStreakTracker(4_000);
    const [done] = tracker.observe(streak(1, true), 0);
    const parsed = parseLiveEvent({ ...done!.draft, id: "tf-gift-1", timestamp: 1_700_000_000_000, source: "tikfinity" });
    expect(parsed.ok).toBe(true);
  });
});

describe("isLocalWebSocketUrl", () => {
  it("aceita ws:// para a própria máquina", () => {
    expect(isLocalWebSocketUrl("ws://localhost:21213/")).toBe(true);
    expect(isLocalWebSocketUrl("ws://127.0.0.1:21213/")).toBe(true);
    expect(isLocalWebSocketUrl("ws://[::1]:21213/")).toBe(true);
  });

  it("recusa outros hosts, outros protocolos e textos que não são URL", () => {
    expect(isLocalWebSocketUrl("ws://192.168.0.10:21213/")).toBe(false);
    expect(isLocalWebSocketUrl("ws://example.com/")).toBe(false);
    expect(isLocalWebSocketUrl("wss://localhost:21213/")).toBe(false);
    expect(isLocalWebSocketUrl("http://localhost:21213/")).toBe(false);
    expect(isLocalWebSocketUrl("não é url")).toBe(false);
  });
});
