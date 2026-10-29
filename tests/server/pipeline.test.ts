import { describe, expect, it } from "vitest";
import type { LiveEvent } from "../../src/shared/events.js";
import { Deduplicator } from "../../src/server/pipeline/Deduplicator.js";
import { EventPipeline, type EventPipelineOptions } from "../../src/server/pipeline/EventPipeline.js";
import { LikeCounter } from "../../src/server/pipeline/LikeCounter.js";
import { RateLimiter } from "../../src/server/pipeline/RateLimiter.js";
import { commentEvent, giftEvent, likeEvent, manualClock } from "../helpers/events.js";

describe("Deduplicator", () => {
  it("aceita um id novo e rejeita o mesmo id dentro da janela", () => {
    const clock = manualClock();
    const dedupe = new Deduplicator(1_000, 10, clock.read);
    expect(dedupe.accept("a")).toBe(true);
    expect(dedupe.accept("a")).toBe(false);
    expect(dedupe.accept("b")).toBe(true);
  });

  it("aceita o id de novo depois que a janela expira", () => {
    const clock = manualClock();
    const dedupe = new Deduplicator(1_000, 10, clock.read);
    dedupe.accept("a");
    clock.advance(999);
    expect(dedupe.accept("a")).toBe(false);
    clock.advance(1);
    // Exatamente no instante em que a janela expira, o id já pode ser aceito de novo.
    expect(dedupe.accept("a")).toBe(true);
  });

  it("limita o tamanho removendo os ids mais antigos", () => {
    const clock = manualClock();
    const dedupe = new Deduplicator(60_000, 3, clock.read);
    ["a", "b", "c", "d"].forEach((id) => dedupe.accept(id));
    expect(dedupe.size).toBe(3);
    expect(dedupe.accept("a")).toBe(true);
  });

  it("rejeita configuração inválida", () => {
    expect(() => new Deduplicator(0, 10, () => 0)).toThrow(RangeError);
    expect(() => new Deduplicator(10, 0, () => 0)).toThrow(RangeError);
  });
});

describe("RateLimiter", () => {
  it("permite uma rajada até a capacidade e depois bloqueia", () => {
    const clock = manualClock();
    const limiter = new RateLimiter({ capacity: 2, refillPerSecond: 1 }, clock.read);
    expect(limiter.tryConsume("u1")).toBe(true);
    expect(limiter.tryConsume("u1")).toBe(true);
    expect(limiter.tryConsume("u1")).toBe(false);
  });

  it("recupera fichas com o tempo, sem passar da capacidade", () => {
    const clock = manualClock();
    const limiter = new RateLimiter({ capacity: 2, refillPerSecond: 1 }, clock.read);
    limiter.tryConsume("u1");
    limiter.tryConsume("u1");
    clock.advance(1_000);
    expect(limiter.tryConsume("u1")).toBe(true);
    expect(limiter.tryConsume("u1")).toBe(false);

    clock.advance(60_000);
    expect(limiter.tryConsume("u1")).toBe(true);
    expect(limiter.tryConsume("u1")).toBe(true);
    expect(limiter.tryConsume("u1")).toBe(false);
  });

  it("mantém limites independentes por chave", () => {
    const clock = manualClock();
    const limiter = new RateLimiter({ capacity: 1, refillPerSecond: 0 }, clock.read);
    expect(limiter.tryConsume("u1")).toBe(true);
    expect(limiter.tryConsume("u1")).toBe(false);
    expect(limiter.tryConsume("u2")).toBe(true);
  });

  it("rejeita regras inválidas", () => {
    expect(() => new RateLimiter({ capacity: 0, refillPerSecond: 1 }, () => 0)).toThrow(RangeError);
    expect(() => new RateLimiter({ capacity: 1, refillPerSecond: -1 }, () => 0)).toThrow(RangeError);
  });
});

describe("LikeCounter", () => {
  it("acumula curtidas e entrega o total de uma vez", () => {
    const counter = new LikeCounter();
    counter.add(2, "simulation");
    counter.add(3, "tiktok");
    expect(counter.pendingCount).toBe(5);
    expect(counter.take()).toEqual({ count: 5, source: "tiktok" });
    expect(counter.take()).toBeNull();
    expect(counter.pendingCount).toBe(0);
  });

  it("ignora contagens inválidas", () => {
    const counter = new LikeCounter();
    counter.add(0, "simulation");
    counter.add(-4, "simulation");
    counter.add(1.5, "simulation");
    expect(counter.take()).toBeNull();
  });
});

function makePipeline(overrides: Partial<EventPipelineOptions> = {}) {
  const clock = manualClock();
  const emitted: LiveEvent[] = [];
  const pipeline = new EventPipeline((event) => emitted.push(event), {
    now: clock.read,
    dedupeTtlMs: 60_000,
    dedupeMaxSize: 1_000,
    userRateLimits: {
      like: { capacity: 30, refillPerSecond: 10 },
      comment: { capacity: 5, refillPerSecond: 1 },
      gift: { capacity: 3, refillPerSecond: 0.5 },
    },
    globalRateLimit: { capacity: 200, refillPerSecond: 60 },
    ...overrides,
  });
  return { pipeline, emitted, clock };
}

describe("EventPipeline", () => {
  it("emite comentários e presentes imediatamente", () => {
    const { pipeline, emitted } = makePipeline();
    expect(pipeline.submit(commentEvent("c1", "u1")).accepted).toBe(true);
    expect(pipeline.submit(giftEvent("g1", "u2")).accepted).toBe(true);
    expect(emitted.map((e) => e.id)).toEqual(["c1", "g1"]);
  });

  it("agrega curtidas e emite um único evento ao descarregar", () => {
    const { pipeline, emitted } = makePipeline();
    pipeline.submit(likeEvent("l1", "u1", 2));
    pipeline.submit(likeEvent("l2", "u2", 3));
    expect(emitted).toHaveLength(0);
    expect(pipeline.pendingLikes).toBe(5);

    pipeline.flushLikes();
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ kind: "like", count: 5, userId: "audience", id: "likes-batch-1" });

    pipeline.flushLikes();
    expect(emitted).toHaveLength(1);
  });

  it("descarta eventos com identificador repetido", () => {
    const { pipeline, emitted } = makePipeline();
    expect(pipeline.submit(commentEvent("dup", "u1")).accepted).toBe(true);
    const second = pipeline.submit(commentEvent("dup", "u1"));
    expect(second).toEqual({ accepted: false, reason: "duplicate", detail: "evento já processado" });
    expect(emitted).toHaveLength(1);
  });

  it("descarta eventos inválidos sem emitir nada", () => {
    const { pipeline, emitted } = makePipeline();
    const result = pipeline.submit({ kind: "comment", id: "x" });
    expect(result.accepted).toBe(false);
    if (!result.accepted) expect(result.reason).toBe("invalid");
    expect(emitted).toHaveLength(0);
  });

  it("limita comentários por usuário, sem afetar outros usuários", () => {
    const { pipeline, emitted } = makePipeline();
    for (let i = 0; i < 5; i += 1) {
      expect(pipeline.submit(commentEvent(`c${i}`, "spam")).accepted).toBe(true);
    }
    const blocked = pipeline.submit(commentEvent("c5", "spam"));
    expect(blocked.accepted).toBe(false);
    if (!blocked.accepted) expect(blocked.reason).toBe("rate_limited");

    expect(pipeline.submit(commentEvent("c6", "outra-pessoa")).accepted).toBe(true);
    expect(emitted).toHaveLength(6);
  });

  it("aplica um limite global quando há uma rajada de eventos de muitos usuários", () => {
    const { pipeline } = makePipeline({ globalRateLimit: { capacity: 2, refillPerSecond: 0 } });
    expect(pipeline.submit(commentEvent("a", "u1")).accepted).toBe(true);
    expect(pipeline.submit(commentEvent("b", "u2")).accepted).toBe(true);
    const result = pipeline.submit(commentEvent("c", "u3"));
    expect(result.accepted).toBe(false);
    if (!result.accepted) expect(result.reason).toBe("rate_limited");
  });

  it("curtidas de um usuário são limitadas pelo balde de curtidas", () => {
    const { pipeline } = makePipeline({ userRateLimits: {
      like: { capacity: 1, refillPerSecond: 0 },
      comment: { capacity: 5, refillPerSecond: 1 },
      gift: { capacity: 3, refillPerSecond: 0.5 },
    } });
    expect(pipeline.submit(likeEvent("l1", "u1", 1)).accepted).toBe(true);
    expect(pipeline.submit(likeEvent("l2", "u1", 1)).accepted).toBe(false);
  });
});

describe("EventPipeline: isolamento entre usuários", () => {
  it("eventos bloqueados pelo limite de um usuário não consomem o orçamento global dos demais", () => {
    const { pipeline, emitted } = makePipeline({
      userRateLimits: {
        like: { capacity: 30, refillPerSecond: 10 },
        comment: { capacity: 2, refillPerSecond: 0 },
        gift: { capacity: 3, refillPerSecond: 0.5 },
      },
      globalRateLimit: { capacity: 3, refillPerSecond: 0 },
    });

    // Um usuário insiste além do próprio limite (2 comentários permitidos).
    for (let i = 0; i < 5; i += 1) pipeline.submit(commentEvent(`spam-${i}`, "spam"));

    // Outro espectador ainda deve conseguir comentar, pois sobrou orçamento global.
    const other = pipeline.submit(commentEvent("ana-1", "ana"));
    expect(other.accepted).toBe(true);
    expect(emitted.map((e) => e.id)).toEqual(["spam-0", "spam-1", "ana-1"]);
  });
});
