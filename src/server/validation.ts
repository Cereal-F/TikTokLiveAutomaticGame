import {
  LIMITS,
  LIVE_EVENT_KINDS,
  type LiveEvent,
  type LiveEventKind,
  type LiveEventSource,
} from "../shared/events.js";
import {
  AUTO_INTERVAL_LIMITS,
  DIAMONDS_LIMITS,
  WAVE_LIMITS,
  type ClientMessage,
  type ClientRole,
} from "../shared/protocol.js";

/**
 * Validação de dados não confiáveis (eventos de conectores e mensagens de clientes).
 * Nada é aceito "por confiança": cada campo é conferido aqui.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

type Obj = Record<string, unknown>;

function isObject(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Remove caracteres de controle e espaços das pontas. */
export function sanitizeText(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
}

function readText(obj: Obj, key: string, maxLength: number, label: string): Result<string> {
  const raw = obj[key];
  if (typeof raw !== "string") return fail(`${label} deve ser texto`);
  const value = sanitizeText(raw);
  if (value.length === 0) return fail(`${label} não pode estar vazio`);
  if (value.length > maxLength) return fail(`${label} excede ${maxLength} caracteres`);
  return ok(value);
}

function readNumber(
  obj: Obj,
  key: string,
  bounds: { min: number; max: number; integer?: boolean },
  label: string,
): Result<number> {
  const raw = obj[key];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fail(`${label} deve ser numérico`);
  if (bounds.integer && !Number.isInteger(raw)) return fail(`${label} deve ser inteiro`);
  if (raw < bounds.min || raw > bounds.max) {
    return fail(`${label} fora do intervalo ${bounds.min}..${bounds.max}`);
  }
  return ok(raw);
}

function isLiveEventKind(value: unknown): value is LiveEventKind {
  return typeof value === "string" && (LIVE_EVENT_KINDS as readonly string[]).includes(value);
}

/** Valida um evento de live vindo de qualquer origem. */
export function parseLiveEvent(raw: unknown): Result<LiveEvent> {
  if (!isObject(raw)) return fail("evento deve ser um objeto");

  if (!isLiveEventKind(raw.kind)) return fail("tipo de evento desconhecido");
  const kind = raw.kind;

  const id = readText(raw, "id", LIMITS.idMaxLength, "id");
  if (!id.ok) return id;
  const userId = readText(raw, "userId", LIMITS.userNameMaxLength, "userId");
  if (!userId.ok) return userId;
  const userName = readText(raw, "userName", LIMITS.userNameMaxLength, "userName");
  if (!userName.ok) return userName;
  const timestamp = readNumber(raw, "timestamp", { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }, "timestamp");
  if (!timestamp.ok) return timestamp;

  const source = raw.source;
  if (source !== "simulation" && source !== "tikfinity") return fail("origem do evento inválida");
  const base = {
    id: id.value,
    userId: userId.value,
    userName: userName.value,
    timestamp: timestamp.value,
    source: source as LiveEventSource,
  };

  switch (kind) {
    case "like": {
      const count = readNumber(raw, "count", { min: 1, max: LIMITS.likeCountMax, integer: true }, "count");
      if (!count.ok) return count;
      return ok({ ...base, kind, count: count.value });
    }
    case "comment": {
      const text = readText(raw, "text", LIMITS.commentMaxLength, "text");
      if (!text.ok) return text;
      return ok({ ...base, kind, text: text.value });
    }
    case "gift": {
      const giftName = readText(raw, "giftName", LIMITS.giftNameMaxLength, "giftName");
      if (!giftName.ok) return giftName;
      const diamonds = readNumber(raw, "diamonds", { min: 0, max: LIMITS.giftDiamondsMax, integer: true }, "diamonds");
      if (!diamonds.ok) return diamonds;
      return ok({ ...base, kind, giftName: giftName.value, diamonds: diamonds.value });
    }
  }
}

function isClientRole(value: unknown): value is ClientRole {
  return value === "game" || value === "admin";
}

/** Valida mensagens enviadas pelos clientes WebSocket. */
export function parseClientMessage(raw: unknown): Result<ClientMessage> {
  if (!isObject(raw)) return fail("mensagem deve ser um objeto");

  switch (raw.type) {
    case "hello": {
      if (!isClientRole(raw.role)) return fail("papel desconhecido");
      return ok({ type: "hello", role: raw.role });
    }
    case "admin:simulate": {
      if (!isLiveEventKind(raw.kind)) return fail("tipo de evento desconhecido");
      const message: { type: "admin:simulate"; kind: LiveEventKind; count?: number; diamonds?: number } = {
        type: "admin:simulate",
        kind: raw.kind,
      };
      if (raw.count !== undefined) {
        const count = readNumber(raw, "count", { min: 1, max: 20, integer: true }, "count");
        if (!count.ok) return count;
        message.count = count.value;
      }
      if (raw.diamonds !== undefined) {
        if (raw.kind !== "gift") return fail("diamonds só se aplica a presentes");
        const diamonds = readNumber(raw, "diamonds", { ...DIAMONDS_LIMITS, integer: true }, "diamonds");
        if (!diamonds.ok) return diamonds;
        message.diamonds = diamonds.value;
      }
      return ok(message);
    }
    case "admin:resetLeaderboard": {
      return ok({ type: "admin:resetLeaderboard" });
    }
    case "game:waveReached": {
      const wave = readNumber(raw, "wave", { ...WAVE_LIMITS, integer: true }, "wave");
      if (!wave.ok) return wave;
      return ok({ type: "game:waveReached", wave: wave.value });
    }
    case "game:runEnded": {
      if (raw.outcome !== "victory" && raw.outcome !== "defeat") return fail("resultado da partida inválido");
      return ok({ type: "game:runEnded", outcome: raw.outcome });
    }
    case "admin:auto": {
      if (typeof raw.enabled !== "boolean") return fail("enabled deve ser booleano");
      if (raw.intervalMs === undefined) return ok({ type: "admin:auto", enabled: raw.enabled });
      const interval = readNumber(
        raw,
        "intervalMs",
        { min: AUTO_INTERVAL_LIMITS.minMs, max: AUTO_INTERVAL_LIMITS.maxMs, integer: true },
        "intervalMs",
      );
      if (!interval.ok) return interval;
      return ok({ type: "admin:auto", enabled: raw.enabled, intervalMs: interval.value });
    }
    default:
      return fail("tipo de mensagem desconhecido");
  }
}
