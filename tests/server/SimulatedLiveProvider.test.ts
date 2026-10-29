import { describe, expect, it } from "vitest";
import type { LiveEvent } from "../../src/shared/events.js";
import { SimulatedLiveProvider } from "../../src/server/live/SimulatedLiveProvider.js";
import type { ProviderSink } from "../../src/server/live/LiveProvider.js";
import type { ProviderStatus } from "../../src/shared/protocol.js";
import { parseLiveEvent } from "../../src/server/validation.js";
import { EventPipeline, type SubmitResult } from "../../src/server/pipeline/EventPipeline.js";

function recordingSink() {
  const raw: unknown[] = [];
  const statuses: ProviderStatus[] = [];
  const sink: ProviderSink = {
    onRawEvent: (value) => raw.push(value),
    onStatus: (status) => statuses.push(status),
  };
  return { sink, raw, statuses };
}

function fixedProvider(random = () => 0.5) {
  let counter = 0;
  return new SimulatedLiveProvider({
    random,
    now: () => 1_700_000_000_000,
    newId: () => `fixed-${(counter += 1)}`,
  });
}

describe("SimulatedLiveProvider", () => {
  it("não gera eventos antes de ser iniciado", () => {
    const provider = fixedProvider();
    expect(provider.trigger("like", 3)).toBe(false);
    expect(provider.setAuto(true)).toBe(false);
    expect(provider.status().state).toBe("idle");
  });

  it("informa conexão ao iniciar e entrega a quantidade pedida de eventos", () => {
    const provider = fixedProvider();
    const { sink, raw, statuses } = recordingSink();
    provider.start(sink);
    expect(statuses[0]?.state).toBe("connected");

    expect(provider.trigger("comment", 3)).toBe(true);
    expect(raw).toHaveLength(3);
    provider.stop();
  });

  it("todo evento gerado passa pela validação de eventos reais", () => {
    const provider = fixedProvider((() => {
      const values = [0.1, 0.9, 0.3, 0.7, 0.99, 0.05, 0.5, 0.2];
      let i = 0;
      return () => values[i++ % values.length] ?? 0.5;
    })());
    const { sink, raw } = recordingSink();
    provider.start(sink);
    provider.trigger("like", 4);
    provider.trigger("comment", 4);
    provider.trigger("gift", 4);

    for (const item of raw) {
      const parsed = parseLiveEvent(item);
      expect(parsed.ok).toBe(true);
    }
    provider.stop();
  });

  it("presente com valor escolhido usa o nome do catálogo quando existe", () => {
    const provider = fixedProvider();
    const { sink, raw } = recordingSink();
    provider.start(sink);
    provider.trigger("gift", 1, 500);
    provider.trigger("gift", 1, 7);
    provider.stop();
    const [catalogue, custom] = raw as { giftName: string; diamonds: number }[];
    expect(catalogue).toMatchObject({ giftName: "Foguete", diamonds: 500 });
    expect(custom).toMatchObject({ giftName: "Presente 7", diamonds: 7 });
  });

  it("gera ids únicos para deduplicação", () => {
    const provider = fixedProvider();
    const { sink, raw } = recordingSink();
    provider.start(sink);
    provider.trigger("like", 5);
    const ids = (raw as LiveEvent[]).map((event) => event.id);
    expect(new Set(ids).size).toBe(5);
    provider.stop();
  });

  it("eventos simulados passam pelo pipeline e chegam ao jogo dentro dos limites normais", () => {
    const provider = fixedProvider();
    const emitted: LiveEvent[] = [];
    const pipeline = new EventPipeline((event) => emitted.push(event), {
      now: () => 1_700_000_000_000,
      dedupeTtlMs: 60_000,
      dedupeMaxSize: 1_000,
      userRateLimits: {
        like: { capacity: 30, refillPerSecond: 10 },
        comment: { capacity: 5, refillPerSecond: 1 },
        gift: { capacity: 3, refillPerSecond: 0.5 },
      },
      globalRateLimit: { capacity: 200, refillPerSecond: 60 },
    });
    const results: SubmitResult[] = [];
    provider.start({
      onRawEvent: (raw: unknown) => results.push(pipeline.submit(raw)),
      onStatus: () => {},
    });
    provider.trigger("comment", 5);
    provider.stop();

    expect(results.every((result) => result.accepted)).toBe(true);
    expect(emitted).toHaveLength(5);
  });

  it("liga e desliga o modo automático e informa o estado", () => {
    const provider = fixedProvider();
    const { sink, statuses } = recordingSink();
    provider.start(sink);
    expect(provider.autoEnabled).toBe(false);

    provider.setAuto(true, 500);
    expect(provider.autoEnabled).toBe(true);
    expect(provider.autoInterval).toBe(500);
    expect(statuses.at(-1)?.detail).toBe("modo automático ligado");

    provider.setAuto(false);
    expect(provider.autoEnabled).toBe(false);
    expect(statuses.at(-1)?.detail).toBe("controle manual");
    provider.stop();
  });

  it("ao parar, não aceita mais comandos e o modo automático é desligado", () => {
    const provider = fixedProvider();
    const { sink } = recordingSink();
    provider.start(sink);
    provider.setAuto(true, 500);
    provider.stop();
    expect(provider.autoEnabled).toBe(false);
    expect(provider.trigger("like")).toBe(false);
  });
});
