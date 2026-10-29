import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/server/config.js";

/** Mensagem do erro lançado por `fn` (ou vazio). Evita depender de regex em toThrow. */
function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  return "";
}

describe("loadConfig", () => {
  it("usa o simulador e a URL padrão do TikFinity", () => {
    const config = loadConfig({});
    expect(config.provider).toBe("simulation");
    expect(config.tikfinityUrl).toBe("ws://localhost:21213/");
  });

  it("aceita LIVE_PROVIDER=tikfinity com uma URL local", () => {
    const config = loadConfig({ LIVE_PROVIDER: "tikfinity", TIKFINITY_URL: "ws://127.0.0.1:9000/" });
    expect(config.provider).toBe("tikfinity");
    expect(config.tikfinityUrl).toBe("ws://127.0.0.1:9000/");
  });

  it("recusa o nome de provedor antigo", () => {
    expect(messageOf(() => loadConfig({ LIVE_PROVIDER: "tiktok" }))).toContain("tikfinity");
  });

  it("recusa TIKFINITY_URL que não seja ws:// para a própria máquina", () => {
    expect(messageOf(() => loadConfig({ TIKFINITY_URL: "ws://192.168.0.10:21213/" }))).toContain("localhost");
    expect(messageOf(() => loadConfig({ TIKFINITY_URL: "https://localhost:21213/" }))).toContain("localhost");
  });

  it("recusa PORT inválida", () => {
    expect(messageOf(() => loadConfig({ PORT: "99999" }))).toContain("PORT");
  });
});
