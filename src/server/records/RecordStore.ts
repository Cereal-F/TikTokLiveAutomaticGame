import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { WAVE_LIMITS, type RecordSnapshot } from "../../shared/protocol.js";

const EMPTY: RecordSnapshot = { bestWave: 0, achievedAt: null };

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

/**
 * Guarda o recorde de ondas em um arquivo JSON, para que sobreviva a reinícios do servidor.
 * Falhas de leitura ou escrita são registradas e não interrompem a partida.
 */
export class RecordStore {
  private current: RecordSnapshot;

  constructor(
    private readonly filePath: string,
    private readonly now: () => Date = () => new Date(),
    private readonly log: (message: string) => void = (message) => console.log(`[servidor] ${message}`),
  ) {
    this.current = this.load();
  }

  snapshot(): RecordSnapshot {
    return { ...this.current };
  }

  /** Registra a onda alcançada. Retorna o novo recorde se ele foi superado; senão, null. */
  update(wave: number): RecordSnapshot | null {
    if (!Number.isInteger(wave) || wave < WAVE_LIMITS.min || wave > WAVE_LIMITS.max) return null;
    if (wave <= this.current.bestWave) return null;

    this.current = { bestWave: wave, achievedAt: this.now().toISOString() };
    this.save();
    return this.snapshot();
  }

  private load(): RecordSnapshot {
    let raw: string;
    try {
      raw = readFileSync(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.log(`não foi possível ler o recorde: ${(error as Error).message}`);
      }
      return { ...EMPTY };
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (isValidRecord(parsed)) return { ...parsed };
    } catch {
      // Tratado abaixo: arquivo corrompido não deve impedir o jogo de iniciar.
    }
    this.log("arquivo de recorde inválido; o recorde começa do zero");
    return { ...EMPTY };
  }

  private save(): void {
    try {
      mkdirSync(path.dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.tmp`;
      writeFileSync(temporary, JSON.stringify(this.current, null, 2), "utf8");
      renameSync(temporary, this.filePath);
    } catch (error) {
      this.log(`não foi possível salvar o recorde: ${(error as Error).message}`);
    }
  }
}
