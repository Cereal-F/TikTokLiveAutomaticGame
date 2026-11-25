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

/** Resultado de uma partida: vitória (chefe final derrotado) ou derrota (vida zerada). */
export type RunOutcome = "victory" | "defeat";

/** Recorde e contadores guardados pelo servidor entre execuções. */
export interface RecordSnapshot {
  bestWave: number;
  /** Instante (ISO 8601) em que o recorde foi alcançado, ou null se ainda não há recorde. */
  achievedAt: string | null;
  wins: number;
  defeats: number;
}

/** Uma linha do ranking de presentes da live (sem identificadores internos). */
export interface LeaderboardEntry {
  userName: string;
  diamonds: number;
}

/** Um espectador no pódio da rodada, com a foto para a tela de fim de partida. */
export interface PodiumEntry {
  /** Identificador de exibição (o @ do espectador). */
  userId: string;
  userName: string;
  avatarUrl?: string;
  /** Diamantes enviados, ou curtidas quando `basis` é "likes". */
  score: number;
}

/**
 * Pódio da rodada: quem mais presenteou. Se ninguém presenteou, o ranking usa curtidas.
 * Vazio quando a rodada não teve nenhum presente nem curtida.
 */
export interface Podium {
  basis: "diamonds" | "likes";
  entries: PodiumEntry[];
}

/** Comandos de teste do painel de administração, aplicados pelo jogo entre quadros. */
export type GameCommand = { kind: "skipWave" } | { kind: "goToWave"; wave: number };

/** Mensagens enviadas pelos clientes ao servidor. */
export type ClientMessage =
  | { type: "hello"; role: ClientRole }
  | { type: "admin:skipWave" }
  | { type: "admin:goToWave"; wave: number }
  | { type: "admin:simulate"; kind: LiveEventKind; count?: number; diamonds?: number }
  | { type: "admin:auto"; enabled: boolean; intervalMs?: number }
  | { type: "admin:resetLeaderboard" }
  | { type: "game:waveReached"; wave: number }
  | { type: "game:runStarted" }
  | { type: "game:runEnded"; outcome: RunOutcome };

/** Mensagens enviadas pelo servidor aos clientes. */
export type ServerMessage =
  | { type: "welcome"; role: ClientRole; providerStatus: ProviderStatus; autoEnabled: boolean }
  | { type: "live:event"; event: LiveEvent }
  | { type: "status"; providerStatus: ProviderStatus; autoEnabled: boolean }
  | { type: "record"; record: RecordSnapshot }
  | { type: "leaderboard"; entries: LeaderboardEntry[]; allTime: LeaderboardEntry | null; podium: Podium }
  | { type: "game:command"; command: GameCommand }
  | { type: "error"; message: string };

export const AUTO_INTERVAL_LIMITS = { minMs: 300, maxMs: 30_000, defaultMs: 2_000 } as const;

export const WAVE_LIMITS = { min: 1, max: 999 } as const;

export const DIAMONDS_LIMITS = { min: 0, max: 100_000 } as const;
