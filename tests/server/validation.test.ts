import { describe, expect, it } from "vitest";
import { LIMITS } from "../../src/shared/events.js";
import { parseClientMessage, parseLiveEvent, sanitizeText } from "../../src/server/validation.js";

const validBase = {
  id: "evt-1",
  userId: "u1",
  userName: "Ana",
  timestamp: 1_700_000_000_000,
  source: "simulation",
};

describe("sanitizeText", () => {
  it("troca caracteres de controle por espaço e remove as pontas", () => {
    expect(sanitizeText("\u0000 a\tb \u007F")).toBe("a b");
  });
});

describe("parseLiveEvent", () => {
  it("aceita uma curtida válida", () => {
    const result = parseLiveEvent({ ...validBase, kind: "like", count: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ kind: "like", count: 5 });
  });

  it("aceita comentário e presente válidos", () => {
    expect(parseLiveEvent({ ...validBase, kind: "comment", text: "GG" }).ok).toBe(true);
    expect(parseLiveEvent({ ...validBase, kind: "gift", giftName: "Rosa", diamonds: 1 }).ok).toBe(true);
  });

  it("rejeita valores que não são objeto", () => {
    expect(parseLiveEvent(null).ok).toBe(false);
    expect(parseLiveEvent("curtida").ok).toBe(false);
    expect(parseLiveEvent([]).ok).toBe(false);
  });

  it("rejeita tipo de evento desconhecido", () => {
    expect(parseLiveEvent({ ...validBase, kind: "share", count: 1 }).ok).toBe(false);
  });

  it("rejeita campos obrigatórios ausentes ou vazios", () => {
    expect(parseLiveEvent({ ...validBase, id: undefined, kind: "like", count: 1 }).ok).toBe(false);
    expect(parseLiveEvent({ ...validBase, id: "   ", kind: "like", count: 1 }).ok).toBe(false);
    expect(parseLiveEvent({ ...validBase, userName: 42, kind: "like", count: 1 }).ok).toBe(false);
  });

  it("rejeita id longo demais", () => {
    const id = "x".repeat(LIMITS.idMaxLength + 1);
    expect(parseLiveEvent({ ...validBase, id, kind: "like", count: 1 }).ok).toBe(false);
  });

  it("rejeita quantidade de curtidas fora do intervalo ou não inteira", () => {
    expect(parseLiveEvent({ ...validBase, kind: "like", count: 0 }).ok).toBe(false);
    expect(parseLiveEvent({ ...validBase, kind: "like", count: LIMITS.likeCountMax + 1 }).ok).toBe(false);
    expect(parseLiveEvent({ ...validBase, kind: "like", count: 1.5 }).ok).toBe(false);
    expect(parseLiveEvent({ ...validBase, kind: "like", count: Number.NaN }).ok).toBe(false);
  });

  it("rejeita comentário que fica vazio depois de sanitizado", () => {
    expect(parseLiveEvent({ ...validBase, kind: "comment", text: "\t\n" }).ok).toBe(false);
  });

  it("rejeita comentário longo demais", () => {
    const text = "a".repeat(LIMITS.commentMaxLength + 1);
    expect(parseLiveEvent({ ...validBase, kind: "comment", text }).ok).toBe(false);
  });

  it("rejeita presente com diamantes negativos", () => {
    expect(parseLiveEvent({ ...validBase, kind: "gift", giftName: "Rosa", diamonds: -1 }).ok).toBe(false);
  });

  it("rejeita timestamp negativo ou fracionário", () => {
    expect(parseLiveEvent({ ...validBase, timestamp: -1, kind: "like", count: 1 }).ok).toBe(false);
    expect(parseLiveEvent({ ...validBase, timestamp: 1.5, kind: "like", count: 1 }).ok).toBe(false);
  });

  it("rejeita origem desconhecida", () => {
    expect(parseLiveEvent({ ...validBase, source: "hacker", kind: "like", count: 1 }).ok).toBe(false);
  });
});

describe("parseClientMessage", () => {
  it("aceita hello com papel válido", () => {
    expect(parseClientMessage({ type: "hello", role: "admin" })).toEqual({
      ok: true,
      value: { type: "hello", role: "admin" },
    });
  });

  it("rejeita papel desconhecido", () => {
    expect(parseClientMessage({ type: "hello", role: "root" }).ok).toBe(false);
  });

  it("aceita simulação sem quantidade (padrão 1 no servidor)", () => {
    expect(parseClientMessage({ type: "admin:simulate", kind: "like" }).ok).toBe(true);
  });

  it("limita a quantidade de simulações por comando", () => {
    expect(parseClientMessage({ type: "admin:simulate", kind: "like", count: 20 }).ok).toBe(true);
    expect(parseClientMessage({ type: "admin:simulate", kind: "like", count: 21 }).ok).toBe(false);
    expect(parseClientMessage({ type: "admin:simulate", kind: "like", count: 0 }).ok).toBe(false);
  });

  it("valida o intervalo do modo automático", () => {
    expect(parseClientMessage({ type: "admin:auto", enabled: true, intervalMs: 300 }).ok).toBe(true);
    expect(parseClientMessage({ type: "admin:auto", enabled: true, intervalMs: 30_000 }).ok).toBe(true);
    expect(parseClientMessage({ type: "admin:auto", enabled: true, intervalMs: 299 }).ok).toBe(false);
    expect(parseClientMessage({ type: "admin:auto", enabled: true, intervalMs: 30_001 }).ok).toBe(false);
    expect(parseClientMessage({ type: "admin:auto", enabled: "sim" }).ok).toBe(false);
  });

  it("aceita presente com valor em diamantes e rejeita valor em outros tipos de evento", () => {
    expect(parseClientMessage({ type: "admin:simulate", kind: "gift", diamonds: 500 }).ok).toBe(true);
    expect(parseClientMessage({ type: "admin:simulate", kind: "gift", diamonds: -1 }).ok).toBe(false);
    expect(parseClientMessage({ type: "admin:simulate", kind: "like", diamonds: 5 }).ok).toBe(false);
  });

  it("aceita o zerar do ranking, sem campos extras obrigatórios", () => {
    expect(parseClientMessage({ type: "admin:resetLeaderboard" }).ok).toBe(true);
  });

  it("aceita a onda alcançada pelo jogo somente como inteiro entre 1 e 999", () => {
    expect(parseClientMessage({ type: "game:waveReached", wave: 1 }).ok).toBe(true);
    expect(parseClientMessage({ type: "game:waveReached", wave: 999 }).ok).toBe(true);
    expect(parseClientMessage({ type: "game:waveReached", wave: 0 }).ok).toBe(false);
    expect(parseClientMessage({ type: "game:waveReached", wave: 1000 }).ok).toBe(false);
    expect(parseClientMessage({ type: "game:waveReached", wave: 2.5 }).ok).toBe(false);
    expect(parseClientMessage({ type: "game:waveReached", wave: "7" }).ok).toBe(false);
  });

  it("aceita o fim de partida apenas com resultado conhecido", () => {
    expect(parseClientMessage({ type: "game:runEnded", outcome: "victory" })).toEqual({
      ok: true,
      value: { type: "game:runEnded", outcome: "victory" },
    });
    expect(parseClientMessage({ type: "game:runEnded", outcome: "defeat" }).ok).toBe(true);
    expect(parseClientMessage({ type: "game:runEnded", outcome: "draw" }).ok).toBe(false);
    expect(parseClientMessage({ type: "game:runEnded" }).ok).toBe(false);
  });

  it("rejeita tipo de mensagem desconhecido e objetos fora do formato", () => {
    expect(parseClientMessage({ type: "shutdown" }).ok).toBe(false);
    expect(parseClientMessage(["hello"]).ok).toBe(false);
    expect(parseClientMessage(undefined).ok).toBe(false);
  });
});
