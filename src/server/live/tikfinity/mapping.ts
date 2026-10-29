import { LIMITS } from "../../../shared/events.js";

/**
 * Tradução pura das mensagens do WebSocket do TikFinity para eventos internos.
 * Nada aqui valida o evento final: o pipeline (parseLiveEvent) continua sendo a barreira.
 * Estas funções apenas extraem campos e descartam o que não puder ser lido.
 *
 * Formato recebido: { "event": "chat" | "gift" | "like" | ..., "data": { ... } }
 * Os nomes dos campos de `data` seguem o TikTok-Live-Connector e ainda não foram
 * conferidos contra uma sessão real (ver README, "Verificação pendente").
 */

type Obj = Record<string, unknown>;

export interface TikFinityEnvelope {
  event: string;
  data: Obj;
}

/** Campos comuns a todo evento de usuário. */
export interface EventFields {
  userId: string;
  userName: string;
}

/** Evento pronto para receber id, timestamp e origem no provedor. */
export type EventDraft =
  | (EventFields & { kind: "comment"; text: string })
  | (EventFields & { kind: "like"; count: number })
  | (EventFields & { kind: "gift"; giftName: string; diamonds: number });

export type GiftDraft = EventFields & { kind: "gift"; giftName: string; diamonds: number };

/** Mensagem de presente antes da decisão de somar uma sequência (combo). */
export interface GiftObservation extends EventFields {
  giftId: string;
  giftName: string;
  diamondCount: number;
  repeatCount: number;
  repeatEnd: boolean;
  /** giftType 1 = presente em sequência: cada mensagem traz o total acumulado. */
  streakable: boolean;
  msgId?: string;
}

const MAX_MSG_ID_LENGTH = 100;

function isObject(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Texto não vazio (sem espaços das pontas), ou undefined. */
function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Inteiro finito, ou undefined. */
function integer(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** Lê o texto JSON de uma mensagem do TikFinity. Retorna null se não tiver o formato esperado. */
export function parseEnvelope(raw: string): TikFinityEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;
  const event = text(parsed.event);
  if (!event || !isObject(parsed.data)) return null;
  return { event, data: parsed.data };
}

/** Identidade do espectador: uniqueId (@ do TikTok) como chave estável; apelido para exibir. */
export function readIdentity(data: Obj): EventFields | null {
  const uniqueId = text(data.uniqueId) ?? (typeof data.userId === "number" ? String(data.userId) : text(data.userId));
  if (!uniqueId) return null;
  const nickname = text(data.nickname) ?? uniqueId;
  return {
    userId: clip(uniqueId, LIMITS.userNameMaxLength),
    userName: clip(nickname, LIMITS.userNameMaxLength),
  };
}

/** Identificador da mensagem original, quando existe e é curto o bastante para ser id de evento. */
export function readMsgId(data: Obj): string | undefined {
  const msgId = text(data.msgId) ?? (typeof data.msgId === "number" ? String(data.msgId) : undefined);
  return msgId && msgId.length <= MAX_MSG_ID_LENGTH ? msgId : undefined;
}

export function mapChat(data: Obj): EventDraft | null {
  const identity = readIdentity(data);
  const comment = text(data.comment);
  if (!identity || !comment) return null;
  return { ...identity, kind: "comment", text: clip(comment, LIMITS.commentMaxLength) };
}

export function mapLike(data: Obj): EventDraft | null {
  const identity = readIdentity(data);
  const count = integer(data.likeCount);
  if (!identity || count === undefined || count < 1) return null;
  // Um lote grande de curtidas numa mensagem só é reduzido ao teto aceito pelo pipeline.
  return { ...identity, kind: "like", count: Math.min(count, LIMITS.likeCountMax) };
}

export function readGift(data: Obj): GiftObservation | null {
  const identity = readIdentity(data);
  const giftName = text(data.giftName);
  const diamondCount = integer(data.diamondCount);
  if (!identity || !giftName || diamondCount === undefined || diamondCount < 0) return null;

  const repeatCount = integer(data.repeatCount);
  const giftId = text(data.giftId) ?? (typeof data.giftId === "number" ? String(data.giftId) : giftName);
  return {
    ...identity,
    giftId,
    giftName: clip(giftName, LIMITS.giftNameMaxLength),
    diamondCount,
    repeatCount: repeatCount !== undefined && repeatCount >= 1 ? repeatCount : 1,
    repeatEnd: data.repeatEnd === true,
    streakable: data.giftType === 1,
    msgId: readMsgId(data),
  };
}

/** Valor total de um presente com `repeat` unidades, limitado ao teto aceito pelo pipeline. */
export function giftDraft(base: EventFields & { giftName: string; diamondCount: number }, repeat: number): GiftDraft {
  const total = base.diamondCount * Math.max(1, repeat);
  return {
    userId: base.userId,
    userName: base.userName,
    kind: "gift",
    giftName: base.giftName,
    diamonds: Math.min(total, LIMITS.giftDiamondsMax),
  };
}
