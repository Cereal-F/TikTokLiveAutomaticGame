import type { LiveEvent, LiveEventKind } from "./events.js";

/** Papéis que um cliente WebSocket pode declarar ao se identificar. */
export type ClientRole = "game" | "admin";

export type ProviderKind = "simulation" | "tiktok";

export type ProviderState = "idle" | "connected" | "disconnected" | "not_configured" | "error";

export interface ProviderStatus {
  kind: ProviderKind;
  state: ProviderState;
  /** Mensagem curta e segura para exibir no painel (nunca contém segredos). */
  detail?: string;
}

/** Mensagens enviadas pelos clientes ao servidor. */
export type ClientMessage =
  | { type: "hello"; role: ClientRole }
  | { type: "admin:simulate"; kind: LiveEventKind; count?: number }
  | { type: "admin:auto"; enabled: boolean; intervalMs?: number };

/** Mensagens enviadas pelo servidor aos clientes. */
export type ServerMessage =
  | { type: "welcome"; role: ClientRole; providerStatus: ProviderStatus; autoEnabled: boolean }
  | { type: "live:event"; event: LiveEvent }
  | { type: "status"; providerStatus: ProviderStatus; autoEnabled: boolean }
  | { type: "error"; message: string };

export const AUTO_INTERVAL_LIMITS = { minMs: 300, maxMs: 30_000, defaultMs: 2_000 } as const;
