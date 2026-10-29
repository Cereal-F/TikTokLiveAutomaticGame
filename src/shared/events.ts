/**
 * Eventos de live normalizados. Todo evento que entra no jogo passa por aqui,
 * venha da simulação local ou de um conector real.
 */

export type LiveEventKind = "like" | "comment" | "gift";

export type LiveEventSource = "simulation" | "tiktok";

interface LiveEventBase {
  /** Identificador único do evento (usado para deduplicação). */
  id: string;
  kind: LiveEventKind;
  userId: string;
  userName: string;
  /** Epoch em milissegundos, definido pela origem do evento. */
  timestamp: number;
  source: LiveEventSource;
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
  /** Valor do presente em "diamantes" (moeda do TikTok LIVE). */
  diamonds: number;
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
} as const;
