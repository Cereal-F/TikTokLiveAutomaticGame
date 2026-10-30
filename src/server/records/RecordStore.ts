import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { WAVE_LIMITS, type RecordSnapshot, type RunOutcome } from "../../shared/protocol.js";
import type { LeaderboardEntry } from "../../shared/protocol.js";

const EMPTY: RecordSnapshot = { bestWave: 0, achievedAt: null, wins: 0, defeats: 0 };

interface GiftTotal {
  userName: string;
  diamonds: number;
}

type GiftTotals = Record<string, GiftTotal>;

function isValidRecord(value: unknown): value is RecordSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { bestWave?: unknown; achievedAt?: unknown };
  const waveOk =
    typeof candidate.bestWave === "number" &&
    Number.isInteger(candidate.bestWave) &&
    candidate.bestWave >= 0 &&
    candidate.bestWave <= WAVE_LIMITS.max;
  const dateOk = candidate.achievedAt === null || typeof candidate.achievedAt === "string";
  return waveOk && dateOk;
}

/** Contador antigo (arquivos gravados antes dos contadores) é lido como zero. */
function counter(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

/** Lê o histórico de presentes; entradas inválidas são descartadas. */
function readGiftTotals(value: unknown): GiftTotals {
  const totals: GiftTotals = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return totals;
  for (const [userId, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== "object" || entry === null) continue;
    const { userName, diamonds } = entry as { userName?: unknown; diamonds?: unknown };
    if (typeof userName !== "string" || typeof diamonds !== "number") continue;
    if (!Number.isInteger(diamonds) || diamonds <= 0) continue;
    totals[userId] = { userName, diamonds };
  }
  return totals;
}

/**
 * Guarda em um arquivo JSON o recorde de ondas, as vitórias e derrotas e o total de
 * presentes de cada espectador desde o início da live (para o "top da live").
 * Falhas de leitura ou escrita são registradas e não interrompem a partida.
 */
export class RecordStore {
  private current: RecordSnapshot;
  private giftTotals: GiftTotals;
  private dirty = false;

  constructor(
    private readonly filePath: string,
    private readonly now: () => Date = () => new Date(),
    private readonly log: (message: string) => void = (message) => console.log(`[servidor] ${message}`),
  ) {
    const loaded = this.load();
    this.current = loaded.record;
    this.giftTotals = loaded.giftTotals;
  }

  snapshot(): RecordSnapshot {
    return { ...this.current };
  }

  /** Registra a onda alcançada. Retorna o novo recorde se ele foi superado; senão, null. */
  update(wave: number): RecordSnapshot | null {
    if (!Number.isInteger(wave) || wave < WAVE_LIMITS.min || wave > WAVE_LIMITS.max) return null;
    if (wave <= this.current.bestWave) return null;

    this.current = { ...this.current, bestWave: wave, achievedAt: this.now().toISOString() };
    this.save();
    return this.snapshot();
  }

  /** Soma uma vitória ou uma derrota e grava. Retorna o estado atualizado. */
  recordRun(outcome: RunOutcome): RecordSnapshot {
    this.current = {
      ...this.current,
      wins: this.current.wins + (outcome === "victory" ? 1 : 0),
      defeats: this.current.defeats + (outcome === "defeat" ? 1 : 0),
    };
    this.save();
    return this.snapshot();
  }

  /** Soma diamantes ao histórico da live. A gravação fica para `flush`, pois presentes podem ser frequentes. */
  addGift(userId: string, userName: string, diamonds: number): void {
    if (!Number.isInteger(diamonds) || diamonds <= 0) return;
    const current = this.giftTotals[userId];
    this.giftTotals[userId] = { userName, diamonds: (current?.diamonds ?? 0) + diamonds };
    this.dirty = true;
  }

  /** Espectador que mais enviou presentes em toda a live, ou null se ainda não houve presentes. */
  topGifter(): LeaderboardEntry | null {
    let best: LeaderboardEntry | null = null;
    for (const total of Object.values(this.giftTotals)) {
      if (!best || total.diamonds > best.diamonds) best = { userName: total.userName, diamonds: total.diamonds };
    }
    return best;
  }

  /** Grava o histórico de presentes pendente, se houver. */
  flush(): void {
    if (this.dirty) this.save();
  }

  private load(): { record: RecordSnapshot; giftTotals: GiftTotals } {
    let raw: string;
    try {
      raw = readFileSync(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.log(`não foi possível ler o recorde: ${(error as Error).message}`);
      }
      return { record: { ...EMPTY }, giftTotals: {} };
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (isValidRecord(parsed)) {
        const fields = parsed as unknown as Record<string, unknown>;
        return {
          record: { ...parsed, wins: counter(parsed.wins), defeats: counter(parsed.defeats) },
          giftTotals: readGiftTotals(fields.giftTotals),
        };
      }
    } catch {
      // Tratado abaixo: arquivo corrompido não deve impedir o jogo de iniciar.
    }
    this.log("arquivo de recorde inválido; o recorde começa do zero");
    return { record: { ...EMPTY }, giftTotals: {} };
  }

  private save(): void {
    try {
      mkdirSync(path.dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.tmp`;
      const data = { ...this.current, giftTotals: this.giftTotals };
      writeFileSync(temporary, JSON.stringify(data, null, 2), "utf8");
      renameSync(temporary, this.filePath);
      this.dirty = false;
    } catch (error) {
      this.log(`não foi possível salvar o recorde: ${(error as Error).message}`);
    }
  }
}
