import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket as ServerSocket } from "ws";
import { TikFinityLiveProvider } from "../../src/server/live/TikFinityLiveProvider.js";
import type { ProviderSink } from "../../src/server/live/LiveProvider.js";
import type { ProviderStatus } from "../../src/shared/protocol.js";
import { parseLiveEvent } from "../../src/server/validation.js";

/** Servidor WebSocket local que se passa pelo TikFinity, para testar o provedor de ponta a ponta. */
async function startFakeTikFinity() {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
  const port = (wss.address() as AddressInfo).port;

  const clients = new Set<ServerSocket>();
  let connections = 0;
  wss.on("connection", (ws) => {
    connections += 1;
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
  });

  return {
    url: `ws://127.0.0.1:${port}/`,
    get connections() {
      return connections;
    },
    get clientCount() {
      return clients.size;
    },
    send(message: unknown): void {
      for (const client of clients) client.send(typeof message === "string" ? message : JSON.stringify(message));
    },
    dropClients(): void {
      for (const client of clients) client.terminate();
    },
    close(): Promise<void> {
      for (const client of clients) client.terminate();
      return new Promise((resolve) => wss.close(() => resolve()));
    },
  };
}

function recordingSink() {
  const raw: Record<string, unknown>[] = [];
  const statuses: ProviderStatus[] = [];
  const sink: ProviderSink = {
    onRawEvent: (value) => raw.push(value as Record<string, unknown>),
    onStatus: (status) => statuses.push(status),
  };
  return { sink, raw, statuses };
}

async function waitFor(check: () => boolean, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error("tempo esgotado esperando a condição");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Mensagem do erro lançado por `fn` (ou vazio). Evita depender de regex em toThrow. */
function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  return "";
}

const quietOptions = { minRetryMs: 20, maxRetryMs: 50, streakTimeoutMs: 60 };

describe("TikFinityLiveProvider", () => {
  it("recusa URL que não seja ws:// para a própria máquina", () => {
    expect(messageOf(() => new TikFinityLiveProvider({ url: "ws://example.com:21213/" }))).toContain("localhost");
    expect(messageOf(() => new TikFinityLiveProvider({ url: "wss://localhost:21213/" }))).toContain("localhost");
  });

  it("entrega chat, curtidas e presentes válidos e ignora os demais eventos", async () => {
    const server = await startFakeTikFinity();
    const provider = new TikFinityLiveProvider({ url: server.url, ...quietOptions });
    const { sink, raw, statuses } = recordingSink();
    provider.start(sink);
    try {
      await waitFor(() => statuses.some((status) => status.state === "connected"));

      server.send({ event: "chat", data: { uniqueId: "ana", nickname: "Ana", comment: "oi", msgId: "c1" } });
      server.send({ event: "like", data: { uniqueId: "ana", likeCount: 4 } });
      server.send({ event: "gift", data: { uniqueId: "bruno", giftName: "Rosa", diamondCount: 5, giftType: 0, repeatCount: 2, msgId: "g1" } });
      server.send({ event: "follow", data: { uniqueId: "carla" } });
      server.send({ event: "roomUser", data: { viewerCount: 30 } });
      server.send("{isto não é json");

      await waitFor(() => raw.length >= 3);
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(raw).toHaveLength(3);

      expect(raw[0]).toMatchObject({ kind: "comment", id: "tf-chat-c1", userName: "Ana", text: "oi", source: "tikfinity" });
      expect(raw[1]).toMatchObject({ kind: "like", count: 4, userId: "ana" });
      expect(raw[2]).toMatchObject({ kind: "gift", giftName: "Rosa", diamonds: 10, id: "tf-gift-g1" });

      for (const item of raw) expect(parseLiveEvent(item).ok).toBe(true);
    } finally {
      provider.stop();
      await server.close();
    }
  });

  it("junta uma sequência de presente em um único evento com o total", async () => {
    const server = await startFakeTikFinity();
    const provider = new TikFinityLiveProvider({ url: server.url, ...quietOptions, streakTimeoutMs: 5_000 });
    const { sink, raw, statuses } = recordingSink();
    provider.start(sink);
    try {
      await waitFor(() => statuses.some((status) => status.state === "connected"));
      const streak = (repeatCount: number, repeatEnd: boolean) => ({
        event: "gift",
        data: { uniqueId: "ana", giftName: "Leão", giftId: 7, diamondCount: 10, giftType: 1, repeatCount, repeatEnd },
      });
      server.send(streak(1, false));
      server.send(streak(2, false));
      server.send(streak(3, true));

      await waitFor(() => raw.length >= 1);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(raw).toHaveLength(1);
      expect(raw[0]).toMatchObject({ kind: "gift", diamonds: 30, giftName: "Leão" });
    } finally {
      provider.stop();
      await server.close();
    }
  });

  it("informa a queda e reconecta sozinho", async () => {
    const server = await startFakeTikFinity();
    const provider = new TikFinityLiveProvider({ url: server.url, ...quietOptions });
    const { sink, statuses } = recordingSink();
    provider.start(sink);
    try {
      await waitFor(() => statuses.some((status) => status.state === "connected"));
      server.dropClients();

      await waitFor(() => statuses.some((status) => status.state === "disconnected" && status.detail?.includes("nova tentativa")));
      await waitFor(() => statuses.filter((status) => status.state === "connected").length >= 2);
      expect(server.connections).toBeGreaterThanOrEqual(2);
    } finally {
      provider.stop();
      await server.close();
    }
  });

  it("stop() fecha a conexão, não reconecta e entrega presentes em sequência abertos", async () => {
    const server = await startFakeTikFinity();
    const provider = new TikFinityLiveProvider({ url: server.url, ...quietOptions, streakTimeoutMs: 5_000 });
    const { sink, raw, statuses } = recordingSink();
    provider.start(sink);
    try {
      await waitFor(() => statuses.some((status) => status.state === "connected"));
      server.send({
        event: "gift",
        data: { uniqueId: "ana", giftName: "Leão", giftId: 7, diamondCount: 10, giftType: 1, repeatCount: 2, repeatEnd: false },
      });
      await new Promise((resolve) => setTimeout(resolve, 30));

      provider.stop();
      expect(provider.status().state).toBe("idle");
      expect(raw).toHaveLength(1);
      expect(raw[0]).toMatchObject({ kind: "gift", diamonds: 20 });

      await waitFor(() => server.clientCount === 0);
      const before = server.connections;
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(server.connections).toBe(before);
    } finally {
      provider.stop();
      await server.close();
    }
  });
});
