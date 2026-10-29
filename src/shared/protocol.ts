import type { LiveEvent, LiveEventKind } from "./events.js";

/** Papéis que um cliente WebSocket pode declarar ao se identificar. */
export type ClientRole = "game" | "admin";

export type ProviderKind = "simulation" | "tikfinity";

export type ProviderState = "idle" | "connected" | "disconnected" | "not_configured" | "error";

export interface ProviderStatus {
  kind: ProviderKind;
  state: ProviderState;
  /** Mensagem curta e segura para exibir no painel (nunca contém segredos). */
  detail?: string;
}

/** Maior onda já alcançada, guardada pelo servidor entre execuções. */
export interface RecordSnapshot {
  bestWave: number;
  /** Instante (ISO 8601) em que o recorde foi alcançado, ou null se ainda não há recorde. */
  achievedAt: string | null;
}

/** Uma linha do ranking de presentes da live (sem identificadores internos). */
export interface LeaderboardEntry {
  userName: string;
  diamonds: number;
}

/** Mensagens enviadas pelos clientes ao servidor. */
export type ClientMessage =
  | { type: "hello"; role: ClientRole }
  | { type: "admin:simulate"; kind: LiveEventKind; count?: number; diamonds?: number }
  | { type: "admin:auto"; enabled: boolean; intervalMs?: number }
  | { type: "admin:resetLeaderboard" }
  | { type: "game:waveReached"; wave: number };

/** Mensagens enviadas pelo servidor aos clientes. */
export type ServerMessage =
  | { type: "welcome"; role: ClientRole; providerStatus: ProviderStatus; autoEnabled: boolean }
  | { type: "live:event"; event: LiveEvent }
  | { type: "status"; providerStatus: ProviderStatus; autoEnabled: boolean }
  | { type: "record"; record: RecordSnapshot }
  | { type: "leaderboard"; entries: LeaderboardEntry[] }
  | { type: "error"; message: string };

export const AUTO_INTERVAL_LIMITS = { minMs: 300, maxMs: 30_000, defaultMs: 2_000 } as const;

export const WAVE_LIMITS = { min: 1, max: 999 } as const;

export const DIAMONDS_LIMITS = { min: 0, max: 100_000 } as const;
