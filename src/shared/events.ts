/**
 * Eventos de live normalizados. Todo evento que entra no jogo passa por aqui,
 * venha da simulação local ou de um conector real.
 */

export type LiveEventKind = "like" | "comment" | "gift";

export type LiveEventSource = "simulation" | "tikfinity";

interface LiveEventBase {
  /** Identificador único do evento (usado para deduplicação). */
  id: string;
  kind: LiveEventKind;
  userId: string;
  userName: string;
  /** Epoch em milissegundos, definido pela origem do evento. */
  timestamp: number;
  source: LiveEventSource;
  /** Foto de perfil (http/https), quando a origem envia. Opcional: o jogo mostra uma inicial se faltar. */
  avatarUrl?: string;
}

export interface LikeEvent extends LiveEventBase {
  kind: "like";
  /** Quantidade de curtidas agregadas neste evento. */
  count: number;
}

export interface CommentEvent extends LiveEventBase {
  kind: "comment";
  text: string;
}

export interface GiftEvent extends LiveEventBase {
  kind: "gift";
  giftName: string;
  /** Valor total do presente em "diamantes" (moeda do TikTok LIVE), somando todas as unidades. */
  diamonds: number;
  /** Quantas unidades do presente foram enviadas de uma vez (ex.: 20 rosas). Padrão: 1. */
  count?: number;
}

export type LiveEvent = LikeEvent | CommentEvent | GiftEvent;

export const LIVE_EVENT_KINDS: readonly LiveEventKind[] = ["like", "comment", "gift"];

export const LIMITS = {
  idMaxLength: 128,
  userNameMaxLength: 64,
  commentMaxLength: 200,
  giftNameMaxLength: 64,
  likeCountMax: 100,
  giftDiamondsMax: 100_000,
  giftCountMax: 1_000,
  avatarUrlMaxLength: 512,
} as const;
